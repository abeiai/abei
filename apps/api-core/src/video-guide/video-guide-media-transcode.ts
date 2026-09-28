import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { HttpStatus } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";

export interface VideoGuideTranscodeFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface VideoGuidePlaybackAssetLike {
  mediaType: string | null;
  mimeType: string;
  objectKey: string;
}

export const videoGuideWebPlaybackMimeType = "video/mp4";
export const videoGuideAsrAudioMimeType = "audio/mp4";
export const videoGuideHistoricalAsrPreprocessTimeoutFallbackMs = 90 * 60 * 1_000;

const videoGuideWebPlaybackFilter =
  "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";

export function shouldTranscodeVideoGuideMediaForWeb(mediaType: "VIDEO" | "AUDIO" | string | null | undefined) {
  return mediaType === "VIDEO";
}

export function isVideoGuideWebPlaybackAsset(asset: VideoGuidePlaybackAssetLike) {
  return asset.mediaType === "VIDEO" && asset.mimeType.toLowerCase() === videoGuideWebPlaybackMimeType && extname(asset.objectKey).toLowerCase() === ".mp4";
}

export function videoGuideWebPlaybackOriginalName(originalName: string) {
  const safeName = basename(originalName).trim() || "video-guide-media";
  const extension = extname(safeName);
  const baseName = extension ? safeName.slice(0, -extension.length) : safeName;

  return `${baseName || "video-guide-media"}.mp4`;
}

export function videoGuideAsrAudioOriginalName(originalName: string) {
  const safeName = basename(originalName).trim() || "video-guide-media";
  const extension = extname(safeName);
  const baseName = extension ? safeName.slice(0, -extension.length) : safeName;

  return `${baseName || "video-guide-media"}.asr.m4a`;
}

export function buildVideoGuideTranscodeArgs(inputPath: string, outputPath: string) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-progress",
    "pipe:2",
    "-nostats",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    "-vf",
    videoGuideWebPlaybackFilter,
    "-c:v",
    "libx264",
    "-preset",
    process.env.VIDEO_GUIDE_TRANSCODE_PRESET?.trim() || "veryfast",
    "-crf",
    process.env.VIDEO_GUIDE_TRANSCODE_CRF?.trim() || "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    process.env.VIDEO_GUIDE_TRANSCODE_AUDIO_BITRATE?.trim() || "128k",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
    "-max_muxing_queue_size",
    "9999",
    outputPath
  ];
}

export function buildVideoGuideAsrAudioArgs(inputUrl: string, outputPath: string) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-progress",
    "pipe:2",
    "-nostats",
    "-y",
    "-i",
    inputUrl,
    "-map",
    "0:a:0",
    "-vn",
    "-sn",
    "-dn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "aac",
    "-b:a",
    process.env.VIDEO_GUIDE_ASR_AUDIO_BITRATE?.trim() || "48k",
    "-movflags",
    "+faststart",
    outputPath
  ];
}

export async function extractVideoGuideAsrAudio(input: {
  mediaName: string;
  mediaUrl: string;
  onHeartbeat?: () => Promise<void>;
}) {
  return extractVideoGuideAsrAudioFromSource({
    mediaName: input.mediaName,
    onHeartbeat: input.onHeartbeat,
    source: input.mediaUrl,
    timeoutFallbackMs: videoGuideHistoricalAsrPreprocessTimeoutFallbackMs
  });
}

export async function extractVideoGuideAsrAudioFromBuffer(
  file: VideoGuideTranscodeFileLike,
  options?: { onProgress?: (percent: number) => void }
) {
  return extractVideoGuideAsrAudioFromSource({
    mediaName: file.originalname,
    onProgress: options?.onProgress,
    sourceBuffer: file.buffer,
    sourceExtension: extname(file.originalname) || ".media"
  });
}

async function extractVideoGuideAsrAudioFromSource(input: {
  mediaName: string;
  onHeartbeat?: () => Promise<void>;
  onProgress?: (percent: number) => void;
  source?: string;
  sourceBuffer?: Buffer;
  sourceExtension?: string;
  timeoutFallbackMs?: number;
}) {
  const directory = await mkdtemp(join(tmpdir(), "xueleai-video-guide-asr-"));
  const inputPath = join(directory, `input${input.sourceExtension ?? ".media"}`);
  const outputPath = join(directory, "output.m4a");

  try {
    let source = input.source;

    if (input.sourceBuffer) {
      await writeFile(inputPath, input.sourceBuffer);
      source = inputPath;
    }

    if (!source) {
      throw new AppException(50003, "字幕识别音频准备失败，媒体文件为空", HttpStatus.BAD_GATEWAY);
    }

    const durationSeconds = input.onProgress ? await probeMediaDurationSeconds(source) : null;

    await runFfmpeg(buildVideoGuideAsrAudioArgs(source, outputPath), {
      timeoutEnv: "VIDEO_GUIDE_ASR_PREPROCESS_TIMEOUT_MS",
      timeoutFallbackMs: input.timeoutFallbackMs ?? 30 * 60 * 1_000,
      timeoutMessage: "字幕识别音频准备超时，请稍后重试",
      failureMessage: "字幕识别音频准备失败",
      onHeartbeat: input.onHeartbeat,
      onProgress: input.onProgress,
      durationSeconds
    });
    const buffer = await readFile(outputPath);

    if (buffer.length <= 0) {
      throw new AppException(50003, "字幕识别音频准备失败，未生成有效音频", HttpStatus.BAD_GATEWAY);
    }

    return {
      buffer,
      mimetype: videoGuideAsrAudioMimeType,
      originalname: videoGuideAsrAudioOriginalName(input.mediaName),
      size: buffer.length
    } satisfies VideoGuideTranscodeFileLike;
  } finally {
    await rm(directory, {
      force: true,
      recursive: true
    }).catch(() => undefined);
  }
}

export async function transcodeVideoGuideMediaToWebMp4(
  file: VideoGuideTranscodeFileLike,
  options?: { onProgress?: (percent: number) => void }
) {
  const directory = await mkdtemp(join(tmpdir(), "xueleai-video-guide-"));
  const inputPath = join(directory, `input${extname(file.originalname) || ".media"}`);
  const outputPath = join(directory, "output.mp4");

  try {
    await mkdir(directory, {
      recursive: true
    });
    await writeFile(inputPath, file.buffer);
    const durationSeconds = options?.onProgress ? await probeMediaDurationSeconds(inputPath) : null;

    await runFfmpeg(buildVideoGuideTranscodeArgs(inputPath, outputPath), {
      durationSeconds,
      onProgress: options?.onProgress
    });
    const buffer = await readFile(outputPath);

    if (buffer.length <= 0) {
      throw new AppException(50003, "视频转码失败，未生成可播放文件", HttpStatus.BAD_GATEWAY);
    }

    return {
      buffer,
      mimetype: videoGuideWebPlaybackMimeType,
      originalname: videoGuideWebPlaybackOriginalName(file.originalname),
      size: buffer.length
    } satisfies VideoGuideTranscodeFileLike;
  } finally {
    await rm(directory, {
      force: true,
      recursive: true
    }).catch(() => undefined);
  }
}

async function runFfmpeg(args: string[], options?: {
  durationSeconds?: number | null;
  failureMessage?: string;
  timeoutEnv?: string;
  timeoutFallbackMs?: number;
  timeoutMessage?: string;
  onHeartbeat?: () => Promise<void>;
  onProgress?: (percent: number) => void;
}) {
  const timeoutMs = positiveInteger(
    process.env[options?.timeoutEnv ?? "VIDEO_GUIDE_TRANSCODE_TIMEOUT_MS"],
    options?.timeoutFallbackMs ?? 30 * 60 * 1000
  );

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"]
    });
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let heartbeat: NodeJS.Timeout | undefined;
    let heartbeatRunning = false;
    let stderrText = "";
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      clearInterval(heartbeat);

      if (error) {
        rejectPromise(error);
        return;
      }

      resolvePromise();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new AppException(
        50003,
        options?.timeoutMessage ?? "视频转码超时，请稍后重试或更换较短的视频",
        HttpStatus.BAD_GATEWAY
      ));
    }, timeoutMs);

    if (options?.onHeartbeat) {
      heartbeat = setInterval(() => {
        if (heartbeatRunning || settled) {
          return;
        }

        heartbeatRunning = true;
        options.onHeartbeat?.()
          .catch((error: unknown) => {
            child.kill("SIGKILL");
            finish(error instanceof Error ? error : new Error("字幕识别音频准备任务续租失败"));
          })
          .finally(() => {
            heartbeatRunning = false;
          });
      }, videoGuideAsrHeartbeatIntervalMs());
    }

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrChunks.reduce((sum, item) => sum + item.length, 0) < 12_000) {
        stderrChunks.push(chunk);
      }

      if (options?.onProgress && options.durationSeconds) {
        stderrText += chunk.toString("utf8");
        const lines = stderrText.split(/\r?\n/);
        stderrText = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("out_time=")) {
            continue;
          }

          const percent = videoGuideFfmpegProgressPercent(line.slice("out_time=".length), options.durationSeconds);

          if (percent !== null) {
            options.onProgress(percent);
          }
        }
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        finish(new AppException(50003, "服务器未安装 ffmpeg，无法转码视频", HttpStatus.BAD_GATEWAY));
        return;
      }

      finish(new AppException(50003, "视频转码进程启动失败", HttpStatus.BAD_GATEWAY));
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish();
        return;
      }

      const detail = Buffer.concat(stderrChunks).toString("utf8").trim();
      const failureMessage = options?.failureMessage ?? "视频转码失败";
      finish(new AppException(50003, detail ? `${failureMessage}：${detail}` : failureMessage, HttpStatus.BAD_GATEWAY));
    });
  });
}

export function videoGuideFfmpegProgressPercent(outTime: string, durationSeconds: number) {
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(outTime.trim());

  if (!match || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  const elapsedSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);

  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    return null;
  }

  return Math.min(99, Math.max(0, Math.floor((elapsedSeconds / durationSeconds) * 100)));
}

async function probeMediaDurationSeconds(source: string) {
  return new Promise<number | null>((resolvePromise) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      source
    ], {
      stdio: ["ignore", "pipe", "ignore"]
    });
    const chunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => resolvePromise(null));
    child.on("close", (code) => {
      const durationSeconds = Number(Buffer.concat(chunks).toString("utf8").trim());

      resolvePromise(code === 0 && Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null);
    });
  });
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function videoGuideAsrHeartbeatIntervalMs() {
  return positiveInteger(process.env.VIDEO_GUIDE_ASR_HEARTBEAT_INTERVAL_MS, 60_000);
}
