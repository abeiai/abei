import { spawn } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

export type PersistedDialogueAudio = {
  url: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  sampleRate: number;
  channels: number;
};

type Transport = { fetchImpl?: typeof fetch; signal?: AbortSignal };
type Scope = { userId: string; projectId: string; generationId: string };
type Config = ReturnType<typeof configFromEnv>;
type Context = { config: Config; transport: Transport; deadline: number };
type Workspace = Context & { directory: string; diskBytes: number };
type AudioInfo = { durationMs: number; sampleRate: number; channels: number; mimeType: string; extension: string };

export class DialogueAudioError extends Error {
  cleanupFailed = false;
  unpublishedObjectKey: string | null = null;
  constructor(readonly code: string, message: string, readonly retryable = false) {
    super(message);
    this.name = "DialogueAudioError";
  }
}

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const emptyHash = sha256("");
const megabyte = 1024 * 1024;
const dashScopeResultHost = "dashscope-result-bj.oss-cn-beijing.aliyuncs.com";
const formats = "wav,mp3,ogg,mov,flac";
const ffmpegInputArgs = ["-protocol_whitelist", "file,pipe", "-format_whitelist", formats];
const blockedAddresses = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
] as const) blockedAddresses.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) {
  blockedAddresses.addSubnet(address, prefix, "ipv6");
}
const globalV6Addresses = new BlockList();
globalV6Addresses.addSubnet("2000::", 3, "ipv6");

export async function persistDialogueClip(input: {
  userId: string;
  projectId: string;
  generationId: string;
  segmentId: string;
  payload: Record<string, unknown>;
  requireWav?: boolean;
}, transport: Transport = {}): Promise<PersistedDialogueAudio> {
  validateScope(input);
  safeId(input.segmentId);
  return withWorkspace(transport, async workspace => {
    const bytes = await providerAudio(input.payload, input, workspace);
    const path = join(workspace.directory, "clip.audio");
    await writeBounded(workspace, path, bytes);
    const info = await probeAudio(path, workspace, workspace.config.maxClipSeconds);
    if (input.requireWav && info.mimeType !== "audio/wav") {
      throw new DialogueAudioError("MASTER_INVALID", "语音模型未返回 PCM WAV 母版，请重试");
    }
    await mediaProcess("ffmpeg", [
      "-v", "error", "-nostdin", "-xerror", ...ffmpegInputArgs, "-i", path,
      "-map", "0:a:0", "-t", String(workspace.config.maxClipSeconds + 1), "-f", "null", "-"
    ], workspace);
    const key = `${scopePrefix(workspace.config, input)}${input.generationId}/clips/${input.segmentId}-${randomUUID()}.${info.extension}`;
    return uploadVerified(bytes, info, key, workspace);
  });
}

export type VoiceDownloadSource = { url: string; objectKey: string; storageProvider: string; sizeBytes?: number };

export async function deleteDialogueClip(input: Scope & { url: string }, transport: Transport = {}) {
  validateScope(input);
  const config = configFromEnv();
  const key = clipKeyFromUrl(input.url, input, config);
  const context = { config, transport, deadline: Date.now() + config.requestTimeoutMs };
  await retry(context, () => storageRequest("DELETE", key, context, async response => {
    if (response.status !== 404) requireOk(response, "CLEANUP_FAILED", "音频母版清理失败");
  }));
}

export async function renderVoiceDownload(input: {
  userId: string;
  source: VoiceDownloadSource;
  format: "mp3" | "wav";
}, transport: Transport = {}): Promise<{ bytes: Buffer; mimeType: string }> {
  safeId(input.userId);
  if (!["mp3", "wav"].includes(input.format)) throw new DialogueAudioError("INVALID_INPUT", "下载格式仅支持 MP3 或 WAV");
  return withWorkspace(transport, async workspace => {
    const bytes = await storedSourceBytes(input.source, workspace);
    const path = join(workspace.directory, "download-source.audio");
    await writeBounded(workspace, path, bytes);
    const info = await probeAudio(path, workspace, workspace.config.maxDurationSeconds);
    const mimeType = input.format === "wav" ? "audio/wav" : "audio/mpeg";
    const unchanged = info.mimeType === mimeType;
    const rate = input.format === "mp3" ? Math.min(48000, info.sampleRate) : info.sampleRate;
    const channels = input.format === "mp3" ? Math.min(2, info.channels) : info.channels;
    const decode = async (file: string) => {
      let count = 0;
      await mediaProcess("ffmpeg", ["-v", "error", "-nostdin", "-xerror", ...ffmpegInputArgs, "-i", file,
        "-map", "0:a:0", "-ac", String(channels), "-ar", String(rate), "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"], workspace, async chunk => {
        count += chunk.length;
        if (count > workspace.config.maxDurationSeconds * rate * channels * 2) throw new DialogueAudioError("AUDIO_LIMIT", "音频导出时长超过限制");
      });
      return count;
    };
    const samples = await decode(path);
    if (!samples || samples % (channels * 2)) throw new DialogueAudioError("AUDIO_INVALID", "音频无法完整解码");
    if (unchanged) return { bytes, mimeType };
    const outputPath = join(workspace.directory, `download.${input.format}`);
    const available = Math.min(workspace.config.maxOutputBytes, workspace.config.maxTempBytes - workspace.diskBytes);
    if (available <= 0) throw new DialogueAudioError("TEMP_LIMIT", "临时音频磁盘用量超过限制");
    const encoding = input.format === "mp3" ? ["-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3"] : ["-c:a", "pcm_s16le", "-f", "wav"];
    await mediaProcess("ffmpeg", ["-v", "error", "-nostdin", "-xerror", "-y", ...ffmpegInputArgs, "-i", path,
      "-map", "0:a:0", "-map_metadata", "-1", "-ac", String(channels), "-ar", String(rate), ...encoding, "-fs", String(available), outputPath], workspace);
    const size = (await stat(outputPath)).size;
    checkBytes(size, available);
    reserveDisk(workspace, size);
    const outputInfo = await probeAudio(outputPath, workspace, workspace.config.maxDurationSeconds + 0.1);
    if (outputInfo.mimeType !== mimeType || outputInfo.channels !== channels || outputInfo.sampleRate !== rate || await decode(outputPath) !== samples) {
      throw new DialogueAudioError("AUDIO_INVALID", "音频导出完整性校验失败，文件可能被截断");
    }
    return { bytes: await readFile(outputPath), mimeType };
  });
}

async function storedSourceBytes(source: VoiceDownloadSource, workspace: Workspace) {
  if (source.storageProvider === "LOCAL") return retry(workspace, () => downloadProvider(source.url, workspace));
  if (source.storageProvider !== "S3") throw new DialogueAudioError("SOURCE_INVALID", "音频来源存储类型不正确");
  const key = source.objectKey;
  if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(key) || key.split("/").some(part => !part || part === "." || part === "..")
    || source.url !== `${workspace.config.publicBase}/${key}`) throw new DialogueAudioError("SOURCE_INVALID", "音频来源地址与存储记录不匹配");
  return retry(workspace, () => storageRequest("GET", key, workspace, async (response, signal) => {
    requireOk(response, "DOWNLOAD_FAILED", "音频文件暂时无法读取，请稍后重试");
    const bytes = await boundedBody(response, workspace.config.maxOutputBytes, signal);
    const hash = response.headers.get("x-amz-meta-sha256");
    if ((hash && sha256(bytes) !== hash.toLowerCase()) || (source.sizeBytes && bytes.length !== source.sizeBytes)) {
      throw new DialogueAudioError("VERIFY_INVALID", "音频文件内容校验失败");
    }
    return bytes;
  }));
}

export async function renderCourseAudioDownload(input: {
  userId: string;
  materialId: string;
  revision: string;
  sources: (VoiceDownloadSource & { mimeType: string })[];
  original: boolean;
}, transport: Transport = {}): Promise<{ bytes: Buffer; mimeType: string }> {
  safeId(input.userId);
  safeId(input.materialId);
  if (!/^[a-f0-9]{64}$/.test(input.revision) || !input.sources.length || input.sources.length > 5000
    || (input.original && input.sources.length !== 1)) {
    throw new DialogueAudioError("INVALID_INPUT", "课件音频下载参数不正确");
  }
  return withWorkspace(transport, async workspace => {
    if (input.original) {
      const source = input.sources[0]!;
      if (!/^audio\/[\w.+-]+$/.test(source.mimeType)) throw new DialogueAudioError("SOURCE_INVALID", "原音频格式不正确");
      return { bytes: await storedSourceBytes(source, workspace), mimeType: source.mimeType };
    }
    const key = `audio/course-downloads/${input.userId}/${input.materialId}/${input.revision}.mp3`;
    const cached = await retry(workspace, () => storageRequest("GET", key, workspace, async (response, signal) => {
      if (response.status === 404) return null;
      requireOk(response, "DOWNLOAD_FAILED", "合并音频暂时无法读取，请稍后重试");
      const bytes = await boundedBody(response, workspace.config.maxOutputBytes, signal);
      if (response.headers.get("content-type") !== "audio/mpeg" || response.headers.get("x-amz-meta-sha256") !== sha256(bytes)) {
        throw new DialogueAudioError("VERIFY_INVALID", "合并音频内容校验失败");
      }
      return bytes;
    }));
    if (cached) return { bytes: cached, mimeType: "audio/mpeg" };

    const rate = 24000;
    const pcmPath = join(workspace.directory, "course.pcm");
    const pcm = await open(pcmPath, "w");
    let samplesBytes = 0;
    try {
      const narrationConfig = configFromEnv(true);
      for (const source of input.sources) {
        // Generated lesson clips use VIDEO_GUIDE_R2; uploads and the export cache use S3.
        const config = source.url === `${narrationConfig.publicBase}/${source.objectKey}` ? narrationConfig : workspace.config;
        const bytes = await storedSourceBytes(source, { ...workspace, config });
        const path = join(workspace.directory, "source.audio");
        await writeBounded(workspace, path, bytes);
        await probeAudio(path, workspace, workspace.config.maxDurationSeconds);
        let decoded = 0;
        await mediaProcess("ffmpeg", ["-v", "error", "-nostdin", "-xerror", ...ffmpegInputArgs, "-i", path,
          "-map", "0:a:0", "-ac", "1", "-ar", String(rate), "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"], workspace, async chunk => {
          decoded += chunk.length;
          samplesBytes += chunk.length;
          if (samplesBytes > workspace.config.maxDurationSeconds * rate * 2) throw new DialogueAudioError("AUDIO_LIMIT", "课件完整音频时长超过导出限制");
          reserveDisk(workspace, chunk.length);
          await pcm.writeFile(chunk);
        });
        if (!decoded || decoded % 2) throw new DialogueAudioError("AUDIO_INVALID", "课件分段音频不完整");
        await rm(path);
        workspace.diskBytes -= bytes.length;
      }
    } finally { await pcm.close(); }
    const outputPath = join(workspace.directory, "course.mp3");
    const available = Math.min(workspace.config.maxOutputBytes, workspace.config.maxTempBytes - workspace.diskBytes);
    if (available <= 0) throw new DialogueAudioError("TEMP_LIMIT", "临时音频磁盘用量超过限制");
    await mediaProcess("ffmpeg", ["-v", "error", "-nostdin", "-xerror", "-y", "-f", "s16le", "-ar", String(rate), "-ac", "1",
      "-i", pcmPath, "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "128k", "-fs", String(available), outputPath], workspace);
    const size = (await stat(outputPath)).size;
    checkBytes(size, available);
    reserveDisk(workspace, size);
    const info = await probeAudio(outputPath, workspace, workspace.config.maxDurationSeconds + 0.1);
    // 24kHz MPEG-2 Layer III may retain tail padding, bounded to one 576-sample frame.
    const maxDecodedBytes = samplesBytes + 576 * 2;
    let decoded = 0;
    await mediaProcess("ffmpeg", ["-v", "error", "-nostdin", "-xerror", ...ffmpegInputArgs, "-i", outputPath,
      "-ac", "1", "-ar", String(rate), "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"], workspace, async chunk => {
      decoded += chunk.length;
      if (decoded > maxDecodedBytes) throw new DialogueAudioError("AUDIO_INVALID", "合并音频完整性校验失败");
    });
    if (decoded < samplesBytes || decoded % 2 || info.mimeType !== "audio/mpeg" || info.sampleRate !== rate || info.channels !== 1) {
      throw new DialogueAudioError("AUDIO_INVALID", "合并音频不完整，请重试");
    }
    const bytes = await readFile(outputPath);
    await uploadVerified(bytes, info, key, workspace, { sharedKey: true });
    return { bytes, mimeType: "audio/mpeg" };
  });
}

export async function mergeDialogueAudio(input: {
  userId: string;
  projectId: string;
  generationId: string;
  segments: { url: string; pauseSeconds: number }[];
  format: "mp3" | "wav" | "opus";
  sampleRate: number;
}, transport: Transport = {}): Promise<PersistedDialogueAudio> {
  validateScope(input);
  if (!Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > 100) {
    throw new DialogueAudioError("INVALID_INPUT", "对话段落数量应为 1-100 段");
  }
  if (!["mp3", "wav", "opus"].includes(input.format)) {
    throw new DialogueAudioError("INVALID_INPUT", "音频输出格式不正确");
  }
  if (![16000, 24000, 48000].includes(input.sampleRate)) {
    throw new DialogueAudioError("INVALID_INPUT", "音频采样率不正确");
  }
  for (const segment of input.segments) {
    const pause = segment?.pauseSeconds;
    if (!Number.isFinite(pause) || pause < 0 || pause > 5 || Math.abs(pause * 10 - Math.round(pause * 10)) > 1e-8) {
      throw new DialogueAudioError("INVALID_INPUT", "段尾停顿应为 0-5 秒，精度为 0.1 秒");
    }
  }

  return withWorkspace(transport, async workspace => {
    // Validate the whole ordered set before the first download, including reused generations.
    const keys = input.segments.map(segment => clipKeyFromUrl(segment.url, input, workspace.config));
    // Ogg Opus always reports a 48kHz decoding clock; publish the actual probed rate.
    const rate = input.format === "opus" ? 48000 : input.sampleRate;
    const pcmPath = join(workspace.directory, "merged.pcm");
    const pcm = await open(pcmPath, "w");
    let totalPcmBytes = 0;
    try {
      for (let index = 0; index < keys.length; index++) {
        const bytes = await verifiedObjectBytes(keys[index]!, workspace.config.maxClipBytes, workspace);
        const source = join(workspace.directory, "source.audio");
        await writeBounded(workspace, source, bytes);
        await probeAudio(source, workspace, workspace.config.maxClipSeconds);
        let clipPcmBytes = 0;
        await mediaProcess("ffmpeg", [
          "-v", "error", "-nostdin", "-xerror", ...ffmpegInputArgs, "-i", source,
          "-map", "0:a:0", "-vn", "-sn", "-dn", "-ac", "1", "-ar", String(rate),
          "-t", String(workspace.config.maxClipSeconds + 1), "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"
        ], workspace, async chunk => {
          clipPcmBytes += chunk.length;
          if (clipPcmBytes > workspace.config.maxClipSeconds * rate * 2) {
            throw new DialogueAudioError("AUDIO_LIMIT", "分句音频时长超过限制");
          }
          reserveDisk(workspace, chunk.length);
          totalPcmBytes += chunk.length;
          if (totalPcmBytes > workspace.config.maxDurationSeconds * rate * 2) {
            throw new DialogueAudioError("AUDIO_LIMIT", "完整音频时长超过限制");
          }
          await pcm.writeFile(chunk);
        });
        if (clipPcmBytes === 0 || clipPcmBytes % 2 !== 0) {
          throw new DialogueAudioError("AUDIO_INVALID", "分句音频无法完整解码");
        }
        await rm(source);
        workspace.diskBytes -= bytes.length;
        let silenceBytes = Math.round(input.segments[index]!.pauseSeconds * rate) * 2;
        totalPcmBytes += silenceBytes;
        if (totalPcmBytes > workspace.config.maxDurationSeconds * rate * 2) {
          throw new DialogueAudioError("AUDIO_LIMIT", "完整音频时长超过限制");
        }
        reserveDisk(workspace, silenceBytes);
        while (silenceBytes > 0) {
          const chunk = Buffer.alloc(Math.min(silenceBytes, rate * 2));
          await pcm.writeFile(chunk);
          silenceBytes -= chunk.length;
        }
      }
    } finally {
      await pcm.close();
    }

    const outputPath = join(workspace.directory, `output.${input.format}`);
    const available = Math.min(workspace.config.maxOutputBytes, workspace.config.maxTempBytes - workspace.diskBytes);
    if (available <= 0) throw new DialogueAudioError("TEMP_LIMIT", "临时音频磁盘用量超过限制");
    const encoding = input.format === "mp3"
      ? ["-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3"]
      : input.format === "opus"
        ? ["-c:a", "libopus", "-b:a", "64k", "-f", "opus"]
        : ["-c:a", "pcm_s16le", "-f", "wav"];
    await mediaProcess("ffmpeg", [
      "-v", "error", "-nostdin", "-xerror", "-y", "-f", "s16le", "-ar", String(rate), "-ac", "1",
      "-i", pcmPath, "-map", "0:a:0", "-map_metadata", "-1", ...encoding,
      "-fs", String(available), outputPath
    ], workspace);
    const size = (await stat(outputPath)).size;
    if (size > available || size < 1) throw new DialogueAudioError("AUDIO_LIMIT", "完整音频文件大小超过限制");
    reserveDisk(workspace, size);
    const info = await probeAudio(outputPath, workspace, workspace.config.maxDurationSeconds + 0.1);
    const expectedDuration = totalPcmBytes / (rate * 2) * 1000;
    const expectedCodec = input.format === "mp3" ? "audio/mpeg" : input.format === "opus" ? "audio/ogg" : "audio/wav";
    if (info.sampleRate !== rate || info.channels !== 1 || info.mimeType !== expectedCodec || Math.abs(info.durationMs - expectedDuration) > 100) {
      throw new DialogueAudioError("AUDIO_INVALID", "完整音频格式或时长校验失败");
    }
    // Exact decoded sample count rejects -fs truncation even within codec-duration tolerance.
    let decodedBytes = 0;
    await mediaProcess("ffmpeg", [
      "-v", "error", "-nostdin", "-xerror", ...ffmpegInputArgs, "-i", outputPath,
      "-map", "0:a:0", "-ac", "1", "-ar", String(rate), "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"
    ], workspace, async chunk => {
      decodedBytes += chunk.length;
      if (decodedBytes > totalPcmBytes) throw new DialogueAudioError("AUDIO_INVALID", "完整音频解码时长校验失败");
    });
    if (decodedBytes !== totalPcmBytes) throw new DialogueAudioError("AUDIO_INVALID", "完整音频解码时长校验失败，文件可能被截断");
    const key = `${scopePrefix(workspace.config, input)}${input.generationId}/merged/${randomUUID()}.${input.format}`;
    return uploadVerified(await readFile(outputPath), info, key, workspace);
  });
}

function configFromEnv(preferNarrationStorage = false) {
  const env = (primary: string, fallback: string, defaultValue = "") => {
    if (preferNarrationStorage && primary.startsWith("S3_")) [primary, fallback] = [fallback, primary];
    return process.env[primary]?.trim() || process.env[fallback]?.trim() || defaultValue;
  };
  const number = (name: string, fallback: number) => {
    const raw = process.env[name]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) throw new DialogueAudioError("CONFIG_INVALID", "语音处理限制配置不正确");
    return value;
  };
  const endpoint = configUrl(env("S3_ENDPOINT", "VIDEO_GUIDE_R2_ENDPOINT"), false);
  const publicBase = configUrl(env("S3_PUBLIC_BASE_URL", "VIDEO_GUIDE_R2_PUBLIC_BASE_URL"), true);
  const bucket = env("S3_BUCKET", "VIDEO_GUIDE_R2_BUCKET", "xueleai");
  const region = env("S3_REGION", "VIDEO_GUIDE_R2_REGION", "auto");
  const accessKeyId = env("S3_ACCESS_KEY_ID", "VIDEO_GUIDE_R2_ACCESS_KEY_ID");
  const secretAccessKey = env("S3_SECRET_ACCESS_KEY", "VIDEO_GUIDE_R2_SECRET_ACCESS_KEY");
  const prefix = (process.env.DIALOGUE_AUDIO_R2_PREFIX?.trim() || "audio/dialogue/").replace(/^\/+|\/+$/g, "") + "/";
  if (!/^[a-z0-9][a-z0-9._/-]*\/$/i.test(prefix) || prefix.slice(0, -1).split("/").some(part => !part || part === "." || part === "..")) {
    throw new DialogueAudioError("CONFIG_INVALID", "语音对象存储目录配置不正确");
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || !accessKeyId || !secretAccessKey || !/^[a-z0-9-]+$/.test(region)) {
    throw new DialogueAudioError("CONFIG_MISSING", "语音对象存储配置不完整");
  }
  const allowedHosts = env("DIALOGUE_TTS_DOWNLOAD_ALLOWED_HOSTS", "VIDEO_GUIDE_TTS_DOWNLOAD_ALLOWED_HOSTS", "*.aliyuncs.com")
    .split(",").map(host => host.trim().toLowerCase()).filter(Boolean);
  if (allowedHosts.some(host => !/^(?:\*\.)?[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host))) {
    throw new DialogueAudioError("CONFIG_INVALID", "语音来源地址白名单配置不正确");
  }
  return {
    endpoint, publicBase, bucket, region, accessKeyId, secretAccessKey, prefix, allowedHosts,
    pathStyle: env("S3_FORCE_PATH_STYLE", "VIDEO_GUIDE_R2_FORCE_PATH_STYLE", "1") !== "0",
    maxClipBytes: number("DIALOGUE_AUDIO_MAX_CLIP_BYTES", 25 * megabyte),
    maxOutputBytes: number("DIALOGUE_AUDIO_MAX_OUTPUT_BYTES", 100 * megabyte),
    maxTempBytes: number("DIALOGUE_AUDIO_MAX_TEMP_BYTES", 512 * megabyte),
    maxClipSeconds: number("DIALOGUE_AUDIO_MAX_CLIP_SECONDS", 1800),
    maxDurationSeconds: number("DIALOGUE_AUDIO_MAX_DURATION_SECONDS", 7200),
    requestTimeoutMs: number("DIALOGUE_AUDIO_REQUEST_TIMEOUT_MS", 30000),
    processTimeoutMs: number("DIALOGUE_AUDIO_PROCESS_TIMEOUT_MS", 60000),
    operationTimeoutMs: number("DIALOGUE_AUDIO_OPERATION_TIMEOUT_MS", 600000)
  };
}

function configUrl(value: string, publicUrl: boolean) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || (publicUrl && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new DialogueAudioError("CONFIG_INVALID", "语音对象存储地址配置不正确");
  }
}

function safeId(value: string) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(value)) {
    throw new DialogueAudioError("INVALID_INPUT", "语音对象标识不正确");
  }
  return value;
}

function validateScope(scope: Scope) {
  safeId(scope?.userId);
  safeId(scope?.projectId);
  safeId(scope?.generationId);
}

function scopePrefix(config: Config, scope: Scope) {
  return `${config.prefix}${scope.userId}/${scope.projectId}/`;
}

function clipKeyFromUrl(value: string, scope: Scope, config: Config) {
  const base = `${config.publicBase}/${scopePrefix(config, scope)}`;
  if (typeof value !== "string" || !value.startsWith(base)) {
    throw new DialogueAudioError("SOURCE_INVALID", "分句音频地址不属于当前用户和项目");
  }
  const remainder = value.slice(base.length);
  if (!/^[a-z0-9][a-z0-9_-]{0,127}\/clips\/[a-z0-9][a-z0-9_-]*\.(?:mp3|wav|opus|m4a|flac)$/i.test(remainder)) {
    throw new DialogueAudioError("SOURCE_INVALID", "分句音频来源地址不正确");
  }
  return scopePrefix(config, scope) + remainder;
}

async function withWorkspace<T>(transport: Transport, operation: (workspace: Workspace) => Promise<T>) {
  transport.signal?.throwIfAborted();
  const config = configFromEnv();
  let directory: string;
  try {
    directory = await mkdtemp(join(process.env.DIALOGUE_AUDIO_TEMP_DIR?.trim() || tmpdir(), "xueleai-dialogue-audio-"));
  } catch {
    throw new DialogueAudioError("TEMP_FAILED", "语音临时目录创建失败");
  }
  let result!: T;
  let failure: DialogueAudioError | undefined;
  try {
    result = await operation({ config, transport, directory, diskBytes: 0, deadline: Date.now() + config.operationTimeoutMs });
  } catch (error) {
    failure = error instanceof DialogueAudioError ? error : new DialogueAudioError("AUDIO_FAILED", "语音文件处理失败，请稍后重试");
  } finally {
    try { await rm(directory, { recursive: true, force: true }); }
    catch {
      failure ??= new DialogueAudioError("TEMP_CLEANUP_FAILED", "语音临时文件清理失败");
      failure.cleanupFailed = true;
    }
  }
  if (failure) throw failure;
  return result;
}

function reserveDisk(workspace: Workspace, size: number) {
  if (workspace.diskBytes + size > workspace.config.maxTempBytes) {
    throw new DialogueAudioError("TEMP_LIMIT", "临时音频磁盘用量超过限制");
  }
  workspace.diskBytes += size;
}

async function writeBounded(workspace: Workspace, path: string, bytes: Buffer) {
  reserveDisk(workspace, bytes.length);
  await writeFile(path, bytes);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function providerAudio(payload: Record<string, unknown>, scope: Scope, context: Context) {
  const output = record(payload?.output);
  const audio = record(output.audio);
  const base64 = [payload?.audioBase64, output.audioBase64, audio.data].find(value => typeof value === "string" && value.trim());
  if (typeof base64 === "string") {
    if (base64.length > Math.ceil(context.config.maxClipBytes / 3) * 4 + 256) {
      throw new DialogueAudioError("AUDIO_LIMIT", "分句音频文件大小超过限制");
    }
    const encoded = base64.replace(/^data:audio\/[\w.+-]+;base64,/i, "").replace(/\s+/g, "");
    if (!encoded || encoded.length % 4 === 1 || !/^[a-z0-9+/]+={0,2}$/i.test(encoded)) {
      throw new DialogueAudioError("AUDIO_INVALID", "语音模型返回的音频数据格式不正确");
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
      throw new DialogueAudioError("AUDIO_INVALID", "语音模型返回的音频数据格式不正确");
    }
    checkBytes(bytes.length, context.config.maxClipBytes);
    return bytes;
  }
  const value = [payload?.audioUrl, payload?.previewAudioUrl, output.url, audio.url, payload?.audio_url, output.audio_url]
    .find(item => typeof item === "string" && item.trim());
  if (typeof value !== "string") throw new DialogueAudioError("AUDIO_MISSING", "语音模型未返回可保存的音频数据");
  if (value.startsWith(`${context.config.publicBase}/`)) {
    return verifiedObjectBytes(clipKeyFromUrl(value, scope, context.config), context.config.maxClipBytes, context);
  }
  return retry(context, () => downloadProvider(value, context));
}

function providerUrl(value: string, config: Config, upgradeDashScopeResult = false) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    // DashScope's signed result works over TLS; never connect to its HTTP form.
    if (upgradeDashScopeResult && url.protocol === "http:" && !url.port
      && host === dashScopeResultHost) url.protocol = "https:";
    const allowed = config.allowedHosts.some(pattern => pattern.startsWith("*.")
      ? host.endsWith(`.${pattern.slice(2)}`) && host !== pattern.slice(2)
      : host === pattern);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash || host.endsWith(".") || host === "localhost" || host.endsWith(".localhost") || isIP(host.replace(/^\[|\]$/g, "")) || !allowed) throw new Error();
    return url;
  } catch {
    throw new DialogueAudioError("SOURCE_INVALID", "语音来源地址不受信任");
  }
}

async function downloadProvider(value: string, context: Context) {
  let url = providerUrl(value, context.config, true);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const result = await network(context, url.toString(), { method: "GET" }, async (response, signal) => {
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) throw new DialogueAudioError("SOURCE_INVALID", "语音来源地址重定向次数超过限制");
        return { next: providerUrl(new URL(location, url).toString(), context.config) };
      }
      requireOk(response, "DOWNLOAD_FAILED", "语音文件下载失败，请稍后重试");
      const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (mime && !mime.startsWith("audio/") && mime !== "application/octet-stream" && mime !== "application/ogg") {
        throw new DialogueAudioError("AUDIO_INVALID", "语音来源返回的文件类型不正确");
      }
      return { bytes: await boundedBody(response, context.config.maxClipBytes, signal) };
    }, true);
    if (result.bytes) return url.hostname === dashScopeResultHost ? normalizeDashScopeWav(result.bytes) : result.bytes;
    url = result.next!;
  }
  throw new DialogueAudioError("SOURCE_INVALID", "语音来源地址重定向次数超过限制");
}

function normalizeDashScopeWav(bytes: Buffer) {
  // DashScope's streaming PCM WAV uses these exact placeholder lengths, even in completed OSS objects.
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF"
    || bytes.toString("ascii", 8, 16) !== "WAVEfmt " || bytes.readUInt32LE(16) !== 16
    || bytes.toString("ascii", 36, 40) !== "data"
    || bytes.readUInt32LE(4) !== 0x7fffffbf || bytes.readUInt32LE(40) !== 0x7fffff9b) return bytes;
  const channels = bytes.readUInt16LE(22);
  const rate = bytes.readUInt32LE(24);
  const blockAlign = bytes.readUInt16LE(32);
  const dataSize = bytes.length - 44;
  if (bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(34) !== 16
    || channels < 1 || channels > 8 || rate < 8000 || rate > 192000
    || blockAlign !== channels * 2 || bytes.readUInt32LE(28) !== rate * blockAlign
    || dataSize <= 0 || dataSize % blockAlign !== 0) {
    throw new DialogueAudioError("AUDIO_INVALID", "语音模型返回的 PCM WAV 数据不完整或格式不正确");
  }
  const normalized = Buffer.from(bytes);
  normalized.writeUInt32LE(bytes.length - 8, 4);
  normalized.writeUInt32LE(dataSize, 40);
  return normalized;
}

function checkBytes(size: number, max: number) {
  if (!Number.isSafeInteger(size) || size <= 0) throw new DialogueAudioError("AUDIO_INVALID", "语音文件为空或大小不正确");
  if (size > max) throw new DialogueAudioError("AUDIO_LIMIT", "音频文件大小超过限制");
}

async function boundedBody(response: Response, max: number, signal: AbortSignal) {
  const declared = response.headers.get("content-length");
  if (declared !== null) checkBytes(Number(declared), max);
  if (!response.body) throw new DialogueAudioError("AUDIO_INVALID", "语音文件为空");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (signal.aborted) throw new DialogueAudioError("NETWORK_TIMEOUT", "语音文件网络请求超时，请稍后重试", true);
      if (part.done) break;
      size += part.value.length;
      if (size > max) throw new DialogueAudioError("AUDIO_LIMIT", "音频文件大小超过限制");
      chunks.push(Buffer.from(part.value));
    }
    checkBytes(size, max);
    if (declared !== null && size !== Number(declared)) throw new DialogueAudioError("VERIFY_FAILED", "音频文件大小校验失败");
    return Buffer.concat(chunks, size);
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function remaining(context: Context, requested: number) {
  if (context.transport.signal?.aborted) throw new DialogueAudioError("ABORTED", "音频导出已取消");
  const value = Math.min(requested, context.deadline - Date.now());
  if (value <= 0) throw new DialogueAudioError("TIMEOUT", "语音处理超时，请稍后重试");
  return value;
}

async function network<T>(context: Context, url: string, init: RequestInit, consume: (response: Response, signal: AbortSignal) => Promise<T>, provider = false) {
  const controller = new AbortController();
  let response: Response | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new DialogueAudioError("NETWORK_TIMEOUT", "语音文件网络请求超时，请稍后重试", true));
    }, remaining(context, context.config.requestTimeoutMs));
  });
  const operation = (async () => {
    const options = { ...init, redirect: "manual" as const, signal: context.transport.signal ? AbortSignal.any([controller.signal, context.transport.signal]) : controller.signal };
    response = await (context.transport.fetchImpl ?? (provider ? pinnedProviderFetch : fetch))(url, options);
    if (controller.signal.aborted) {
      await response.body?.cancel().catch(() => undefined);
      throw new DialogueAudioError("NETWORK_TIMEOUT", "语音文件网络请求超时", true);
    }
    return consume(response, options.signal);
  })();
  try {
    return await Promise.race([operation, deadline]);
  } catch (error) {
    if (error instanceof DialogueAudioError) throw error;
    throw new DialogueAudioError("NETWORK_FAILED", "语音文件网络请求失败，请稍后重试", true);
  } finally {
    if (timeout) clearTimeout(timeout);
    controller.abort();
    // Cancellation must reach a locked body reader too, including injected transports.
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined);
  }
}

// Pin provider connections to validated public DNS answers to close the lookup/fetch rebinding gap.
const pinnedProviderFetch: typeof fetch = async (input, init = {}) => {
  init.signal?.throwIfAborted();
  const url = new URL(String(input));
  const answers = await lookup(url.hostname, { all: true });
  init.signal?.throwIfAborted();
  if (!answers.length || answers.some(answer => !publicAddress(answer.address))) {
    throw new DialogueAudioError("SOURCE_INVALID", "语音来源地址解析到不受信任的网络");
  }
  const answer = answers[0]!;
  return new Promise<Response>((resolve, reject) => {
    const req = request(url, {
      method: "GET", agent: false, signal: init.signal ?? undefined, family: answer.family,
      lookup: (_host, _options, callback) => callback(null, answer.address, answer.family)
    }, res => {
      try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        const status = res.statusCode ?? 502;
        const body = [204, 205, 304].includes(status) ? null : Readable.toWeb(res) as ReadableStream<Uint8Array>;
        if (body === null) res.resume();
        resolve(new Response(body, { status, headers }));
      } catch (error) {
        res.destroy();
        reject(error);
      }
    });
    req.on("error", reject);
    req.end();
  });
};

function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !blockedAddresses.check(address, "ipv4")
    : family === 6 && globalV6Addresses.check(address, "ipv6") && !blockedAddresses.check(address, "ipv6");
}

function objectUrl(config: Config, key: string) {
  const url = new URL(config.endpoint);
  if (!config.pathStyle) url.hostname = `${config.bucket}.${url.hostname}`;
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${config.pathStyle ? config.bucket + "/" : ""}${key}`;
  return url;
}

function signedHeaders(url: URL, method: string, context: Context, bytes?: Buffer, mimeType?: string) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const hash = bytes ? sha256(bytes) : emptyHash;
  const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": hash, "x-amz-date": amzDate };
  if (bytes) Object.assign(headers, {
    "content-type": mimeType!, "content-length": String(bytes.length),
    "content-md5": createHash("md5").update(bytes).digest("base64"), "x-amz-meta-sha256": hash,
    "cache-control": "public, max-age=31536000, immutable"
  });
  const names = Object.keys(headers).sort();
  const canonicalPath = url.pathname.split("/").map(part => encodeURIComponent(decodeURIComponent(part)).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");
  const canonical = [method, canonicalPath, "", names.map(name => `${name}:${headers[name]!.trim().replace(/\s+/g, " ")}`).join("\n") + "\n", names.join(";"), hash].join("\n");
  const scope = `${amzDate.slice(0, 8)}/${context.config.region}/s3/aws4_request`;
  let key: Buffer = Buffer.from(`AWS4${context.config.secretAccessKey}`);
  for (const value of [amzDate.slice(0, 8), context.config.region, "s3", "aws4_request"]) key = createHmac("sha256", key).update(value).digest();
  const signature = createHmac("sha256", key).update(["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n")).digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${context.config.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
  return headers;
}

function requireOk(response: Response, code: string, message: string) {
  if (!response.ok) throw new DialogueAudioError(code, message, [408, 425, 429].includes(response.status) || response.status >= 500);
}

async function storageRequest<T>(method: string, key: string, context: Context, consume: (response: Response, signal: AbortSignal) => Promise<T>, bytes?: Buffer, mimeType?: string) {
  const url = objectUrl(context.config, key);
  return network(context, url.toString(), {
    method, headers: signedHeaders(url, method, context, bytes, mimeType),
    ...(bytes ? { body: new Uint8Array(bytes) } : {})
  }, consume);
}

async function verifiedObjectBytes(key: string, max: number, context: Context, expected?: { bytes: Buffer; mimeType: string }) {
  const metadata = await retry(context, () => storageRequest("HEAD", key, context, async response => {
    requireOk(response, "VERIFY_FAILED", "音频对象存储校验失败，请稍后重试");
    const size = Number(response.headers.get("content-length"));
    const hash = response.headers.get("x-amz-meta-sha256")?.trim().toLowerCase();
    const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    checkBytes(size, max);
    if (!hash || !/^[a-f0-9]{64}$/.test(hash) || !mime?.startsWith("audio/")
      || expected && (size !== expected.bytes.length || hash !== sha256(expected.bytes) || mime !== expected.mimeType)) {
      throw new DialogueAudioError("VERIFY_INVALID", "音频上传结果与源文件不一致，校验失败");
    }
    return { size, hash, mime };
  }));
  return retry(context, () => storageRequest("GET", key, context, async (response, signal) => {
    requireOk(response, "VERIFY_FAILED", "音频对象存储读取校验失败，请稍后重试");
    const bytes = await boundedBody(response, max, signal);
    if (bytes.length !== metadata.size || sha256(bytes) !== metadata.hash) {
      throw new DialogueAudioError("VERIFY_INVALID", "音频对象内容校验失败");
    }
    return bytes;
  }));
}

async function uploadVerified(bytes: Buffer, info: AudioInfo, key: string, context: Context, options: { sharedKey?: boolean } = {}): Promise<PersistedDialogueAudio> {
  try {
    await retry(context, () => storageRequest("PUT", key, context, async response => {
      requireOk(response, "UPLOAD_FAILED", "音频上传到对象存储失败，请稍后重试");
    }, bytes, info.mimeType));
    await verifiedObjectBytes(key, bytes.length, context, { bytes, mimeType: info.mimeType });
    return {
      url: `${context.config.publicBase}/${key}`, objectKey: key, mimeType: info.mimeType,
      sizeBytes: bytes.length, durationMs: info.durationMs, sampleRate: info.sampleRate, channels: info.channels
    };
  } catch (error) {
    // Another process may have published or downloaded this deterministic cache key already.
    if (options.sharedKey) throw error;
    if (error instanceof DialogueAudioError) {
      error.unpublishedObjectKey = key;
      if (error.code.startsWith("NETWORK_") || error.code === "TIMEOUT") error.message = `音频保存失败：${error.message}`;
    }
    // A timed-out PUT can have succeeded remotely. Only this invocation's unique unpublished key is deleted.
    try {
      const cleanup = { ...context, deadline: Date.now() + 30000 };
      await retry(cleanup, () => storageRequest("DELETE", key, cleanup, async response => {
        if (response.status !== 404) requireOk(response, "CLEANUP_FAILED", "音频对象清理失败");
      }));
    } catch {
      if (error instanceof DialogueAudioError) error.cleanupFailed = true;
    }
    throw error;
  }
}

async function retry<T>(context: Context, operation: () => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    remaining(context, 1);
    try { return await operation(); }
    catch (error) {
      if (!(error instanceof DialogueAudioError) || !error.retryable || attempt >= 2) throw error;
      await new Promise<void>(resolve => setTimeout(resolve, remaining(context, 200 * (attempt + 1))));
    }
  }
}

async function probeAudio(path: string, context: Context, maxSeconds: number): Promise<AudioInfo> {
  const raw = await mediaProcess("ffprobe", [
    "-v", "error", ...ffmpegInputArgs, "-show_entries",
    "stream=codec_type,codec_name,sample_rate,channels,duration:format=format_name,duration", "-of", "json", path
  ], context);
  let data: Record<string, unknown>;
  try { data = record(JSON.parse(raw)); }
  catch { throw new DialogueAudioError("AUDIO_INVALID", "音频元数据校验失败"); }
  const streams = Array.isArray(data.streams) ? data.streams.map(record) : [];
  if (streams.length !== 1 || streams[0]?.codec_type !== "audio") throw new DialogueAudioError("AUDIO_INVALID", "音频文件必须包含单一语音流");
  const stream = streams[0]!;
  const format = record(data.format);
  const durationMs = Math.round(Number(stream.duration ?? format.duration) * 1000);
  const rate = Number(stream.sample_rate);
  const channels = Number(stream.channels);
  const name = String(format.format_name).split(",");
  const type = name.includes("wav") && String(stream.codec_name).startsWith("pcm_") ? ["audio/wav", "wav"]
    : name.includes("mp3") && stream.codec_name === "mp3" ? ["audio/mpeg", "mp3"]
      : name.includes("ogg") && stream.codec_name === "opus" ? ["audio/ogg", "opus"]
        : name.includes("mov") && stream.codec_name === "aac" ? ["audio/mp4", "m4a"]
          : name.includes("flac") && stream.codec_name === "flac" ? ["audio/flac", "flac"] : null;
  if (!type || !Number.isFinite(durationMs) || durationMs <= 0 || !Number.isInteger(rate) || rate < 8000 || rate > 192000 || !Number.isInteger(channels) || channels < 1 || channels > 8) {
    throw new DialogueAudioError("AUDIO_INVALID", "音频格式或时长校验失败");
  }
  if (durationMs > maxSeconds * 1000) throw new DialogueAudioError("AUDIO_LIMIT", "音频时长超过限制");
  return { durationMs, sampleRate: rate, channels, mimeType: type[0]!, extension: type[1]! };
}

async function mediaProcess(binary: "ffmpeg" | "ffprobe", args: string[], context: Context, onChunk?: (chunk: Buffer) => Promise<void>) {
  const timeoutMs = remaining(context, context.config.processTimeoutMs);
  const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
  let failure: DialogueAudioError | undefined;
  let exitCode: number | null = null;
  let output = "";
  let stderrBytes = 0;
  const stop = (error: DialogueAudioError) => {
    failure ??= error;
    child.kill("SIGKILL");
  };
  child.stderr.on("data", (chunk: Buffer) => {
    stderrBytes += chunk.length;
    if (stderrBytes > 65536) stop(new DialogueAudioError("AUDIO_INVALID", "语音文件处理日志超过限制"));
  });
  const closed = new Promise<void>(resolve => {
    child.once("error", () => stop(new DialogueAudioError("MEDIA_UNAVAILABLE", "服务器语音处理工具不可用")));
    child.once("close", code => { exitCode = code; resolve(); });
  });
  const timeout = setTimeout(() => stop(new DialogueAudioError("PROCESS_TIMEOUT", "语音文件处理超时，请稍后重试")), timeoutMs);
  const abort = () => stop(new DialogueAudioError("ABORTED", "音频导出已取消"));
  context.transport.signal?.addEventListener("abort", abort, { once: true });
  if (context.transport.signal?.aborted) abort();
  const consume = (async () => {
    try {
      for await (const chunk of child.stdout) {
        if (onChunk) await onChunk(Buffer.from(chunk));
        else {
          output += String(chunk);
          if (Buffer.byteLength(output) > 65536) throw new DialogueAudioError("AUDIO_INVALID", "音频元数据超过限制");
        }
      }
    } catch (error) {
      stop(error instanceof DialogueAudioError ? error : new DialogueAudioError("AUDIO_FAILED", "语音文件处理失败"));
    }
  })();
  try {
    await Promise.all([closed, consume]);
    if (failure) throw failure;
    if (exitCode !== 0) throw new DialogueAudioError("AUDIO_INVALID", "语音文件无法完整解码或处理失败");
    return output;
  } finally {
    clearTimeout(timeout);
    context.transport.signal?.removeEventListener("abort", abort);
  }
}
