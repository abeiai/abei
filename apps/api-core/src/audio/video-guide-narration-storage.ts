import { createHash, createHmac } from "node:crypto";

export type VideoGuideNarrationPersistenceStage = "UPLOADING" | "VERIFYING";

export interface VideoGuideNarrationPersistenceRequest {
  lessonId: string;
  generationId: string;
  nodeId: string;
  audioTaskId: string;
  format: "mp3";
  namespace?: string;
}

export interface PersistedVideoGuideNarrationAudio {
  storageProvider: "S3";
  objectKey: string;
  url: string;
  mimeType: "audio/mpeg";
  sizeBytes: number;
  sha256: string;
}

export interface VideoGuideNarrationR2Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  pathStyle: boolean;
  prefix: string;
  maxBytes: number;
  timeoutMs: number;
  providerDownloadAllowedHosts: string[];
}

interface PersistVideoGuideNarrationAudioInput {
  providerPayload: Record<string, unknown>;
  request: VideoGuideNarrationPersistenceRequest;
  config?: VideoGuideNarrationR2Config;
  fetchImpl?: typeof fetch;
  onStage?: (stage: VideoGuideNarrationPersistenceStage) => Promise<void>;
}

export class VideoGuideNarrationStorageError extends Error {
  constructor(
    readonly code:
      | "TTS_OUTPUT_MISSING"
      | "TTS_OUTPUT_DOWNLOAD_FAILED"
      | "TTS_OUTPUT_INVALID"
      | "R2_UPLOAD_FAILED"
      | "R2_VERIFY_FAILED"
      | "R2_VERIFY_INVALID"
      | "R2_CLEANUP_FAILED"
      | "R2_CONFIG_MISSING",
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "VideoGuideNarrationStorageError";
  }
}

const audioMimeType = "audio/mpeg" as const;
const emptyPayloadHash = createHash("sha256").update("").digest("hex");
const defaultMaxBytes = 25 * 1024 * 1024;
const defaultTimeoutMs = 30_000;
const defaultProviderDownloadAllowedHosts = ["*.aliyuncs.com"];
const maxProviderRedirects = 3;
const persistenceMaxAttempts = 3;
const persistenceRetryBaseDelayMs = 200;

export async function persistVideoGuideNarrationAudio(
  input: PersistVideoGuideNarrationAudioInput
): Promise<PersistedVideoGuideNarrationAudio> {
  const config = normalizeConfig(input.config ?? videoGuideNarrationR2ConfigFromEnv());
  const fetchImpl = input.fetchImpl ?? fetch;
  const bytes = await retryTransientPersistenceOperation(() =>
    audioBytesFromProviderPayload(input.providerPayload, config, fetchImpl)
  );
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const objectKey = buildObjectKey(config.prefix, input.request);
  const objectUrl = buildR2ObjectUrl(config, objectKey);

  await input.onStage?.("UPLOADING");
  await retryTransientPersistenceOperation(() =>
    putR2Object({
      bytes,
      config,
      fetchImpl,
      objectUrl,
      sha256
    })
  );

  try {
    await input.onStage?.("VERIFYING");
    await retryTransientPersistenceOperation(() =>
      verifyR2Object({
        config,
        fetchImpl,
        objectUrl,
        sha256,
        sizeBytes: bytes.byteLength
      })
    );
  } catch (error) {
    await deleteR2Object({ config, fetchImpl, objectUrl }).catch(() => undefined);
    throw error;
  }

  return {
    storageProvider: "S3",
    objectKey,
    url: `${config.publicBaseUrl.replace(/\/+$/, "")}/${objectKey}`,
    mimeType: audioMimeType,
    sizeBytes: bytes.byteLength,
    sha256
  };
}

export async function deletePersistedVideoGuideNarrationAudio(
  persisted: Pick<PersistedVideoGuideNarrationAudio, "objectKey">,
  options: {
    config?: VideoGuideNarrationR2Config;
    fetchImpl?: typeof fetch;
  } = {}
) {
  const config = normalizeConfig(options.config ?? videoGuideNarrationR2ConfigFromEnv());

  if (!persisted.objectKey.startsWith(config.prefix)) {
    throw new VideoGuideNarrationStorageError("R2_CLEANUP_FAILED", "导学语音对象不属于当前存储目录");
  }

  await deleteR2Object({
    config,
    fetchImpl: options.fetchImpl ?? fetch,
    objectUrl: buildR2ObjectUrl(config, persisted.objectKey)
  });
}

export function videoGuideNarrationObjectKey(
  request: VideoGuideNarrationPersistenceRequest,
  prefix = process.env.VIDEO_GUIDE_R2_NARRATION_PREFIX?.trim() || "video-guide/narration/"
) {
  return buildObjectKey(prefix, request);
}

export async function verifyPersistedVideoGuideNarrationAudio(
  persisted: PersistedVideoGuideNarrationAudio,
  options: {
    request: VideoGuideNarrationPersistenceRequest;
    config?: VideoGuideNarrationR2Config;
    fetchImpl?: typeof fetch;
  }
) {
  const config = normalizeConfig(options.config ?? videoGuideNarrationR2ConfigFromEnv());
  const expectedObjectKey = buildObjectKey(config.prefix, options.request);
  const expectedUrl = `${config.publicBaseUrl}/${expectedObjectKey}`;

  if (
    persisted.storageProvider !== "S3" ||
    persisted.objectKey !== expectedObjectKey ||
    persisted.url !== expectedUrl ||
    persisted.mimeType !== audioMimeType ||
    !Number.isInteger(persisted.sizeBytes) ||
    persisted.sizeBytes <= 0 ||
    !/^[a-f0-9]{64}$/i.test(persisted.sha256)
  ) {
    throw new VideoGuideNarrationStorageError(
      "R2_VERIFY_INVALID",
      "导学语音断点与当前课件节点不匹配"
    );
  }

  await retryTransientPersistenceOperation(() =>
    verifyR2Object({
      config,
      fetchImpl: options.fetchImpl ?? fetch,
      objectUrl: buildR2ObjectUrl(config, persisted.objectKey),
      sha256: persisted.sha256,
      sizeBytes: persisted.sizeBytes
    })
  );

  return persisted;
}

export function sanitizePersistedTtsPayload(
  payload: Record<string, unknown>,
  persisted: PersistedVideoGuideNarrationAudio
) {
  const safePayload = { ...payload };
  delete safePayload.audioBase64;
  delete safePayload.audioUrl;
  delete safePayload.previewAudioUrl;
  delete safePayload.raw;

  return {
    ...safePayload,
    persistence: {
      status: "SUCCEEDED" as const,
      ...persisted
    }
  };
}

export function persistedVideoGuideAudioFromPayload(
  payload: Record<string, unknown>
): PersistedVideoGuideNarrationAudio | null {
  const persistence = isRecord(payload.persistence) ? payload.persistence : null;

  if (
    !persistence ||
    persistence.status !== "SUCCEEDED" ||
    persistence.storageProvider !== "S3" ||
    typeof persistence.objectKey !== "string" ||
    !persistence.objectKey ||
    typeof persistence.url !== "string" ||
    !persistence.url ||
    persistence.mimeType !== audioMimeType ||
    typeof persistence.sizeBytes !== "number" ||
    !Number.isFinite(persistence.sizeBytes) ||
    persistence.sizeBytes <= 0 ||
    typeof persistence.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(persistence.sha256)
  ) {
    return null;
  }

  return {
    storageProvider: "S3",
    objectKey: persistence.objectKey,
    url: persistence.url,
    mimeType: audioMimeType,
    sizeBytes: persistence.sizeBytes,
    sha256: persistence.sha256.toLowerCase()
  };
}

export function audioAssetDataFromTtsPayload(userId: string, payload: Record<string, unknown>) {
  const persisted = persistedVideoGuideAudioFromPayload(payload);

  if (!persisted) {
    return null;
  }

  return {
    userId,
    type: "TTS_OUTPUT" as const,
    storageProvider: "S3" as const,
    url: persisted.url,
    objectKey: persisted.objectKey,
    mimeType: persisted.mimeType,
    sizeBytes: persisted.sizeBytes
  };
}

async function audioBytesFromProviderPayload(
  payload: Record<string, unknown>,
  config: VideoGuideNarrationR2Config,
  fetchImpl: typeof fetch
) {
  const base64 = stringValue(payload.audioBase64);

  if (base64) {
    return decodeAudioBase64(base64, config.maxBytes);
  }

  const audioUrl = stringValue(payload.audioUrl);

  if (!audioUrl) {
    throw new VideoGuideNarrationStorageError("TTS_OUTPUT_MISSING", "语音模型未返回可保存的音频数据");
  }

  return downloadProviderAudio(audioUrl, config, fetchImpl);
}

function decodeAudioBase64(value: string, maxBytes: number) {
  const encoded = value.replace(/^data:audio\/[\w.+-]+;base64,/i, "").replace(/\s+/g, "");

  if (!encoded || encoded.length % 4 === 1 || !/^[a-z0-9+/]*={0,2}$/i.test(encoded)) {
    throw new VideoGuideNarrationStorageError("TTS_OUTPUT_INVALID", "语音模型返回的音频数据格式不正确");
  }

  const estimatedBytes = Math.floor((encoded.length * 3) / 4);

  if (estimatedBytes > maxBytes) {
    throw new VideoGuideNarrationStorageError("TTS_OUTPUT_INVALID", "单句导学语音文件超过大小限制");
  }

  const bytes = Buffer.from(encoded, "base64");
  assertValidAudioBytes(bytes, maxBytes);

  return bytes;
}

export async function downloadTtsProviderAudio(audioUrl: string, maxBytes: number, fetchImpl: typeof fetch = fetch) {
  return downloadProviderAudio(audioUrl, {
    providerDownloadAllowedHosts: normalizedProviderDownloadAllowedHosts(
      process.env.VIDEO_GUIDE_TTS_DOWNLOAD_ALLOWED_HOSTS?.split(",") ?? defaultProviderDownloadAllowedHosts
    ),
    timeoutMs: defaultTimeoutMs,
    maxBytes
  }, fetchImpl);
}

async function downloadProviderAudio(
  audioUrl: string,
  config: Pick<VideoGuideNarrationR2Config, "providerDownloadAllowedHosts" | "timeoutMs" | "maxBytes">,
  fetchImpl: typeof fetch
) {
  let currentUrl = allowedProviderAudioUrl(audioUrl, config.providerDownloadAllowedHosts);
  let response: Response | null = null;

  for (let redirectCount = 0; redirectCount <= maxProviderRedirects; redirectCount += 1) {
    try {
      response = await fetchWithTimeout(
        fetchImpl,
        currentUrl,
        {
          method: "GET",
          redirect: "manual"
        },
        config.timeoutMs
      );
    } catch (error) {
      if (error instanceof VideoGuideNarrationStorageError) {
        throw error;
      }

      throw new VideoGuideNarrationStorageError(
        "TTS_OUTPUT_DOWNLOAD_FAILED",
        "语音文件下载失败，请稍后重试",
        true
      );
    }

    if (!isRedirectResponse(response)) {
      break;
    }

    const location = response.headers.get("location");

    if (!location || redirectCount >= maxProviderRedirects) {
      throw new VideoGuideNarrationStorageError("TTS_OUTPUT_DOWNLOAD_FAILED", "语音文件重定向次数过多");
    }

    currentUrl = allowedProviderAudioUrl(new URL(location, currentUrl).toString(), config.providerDownloadAllowedHosts);
  }

  if (!response?.ok) {
    throw new VideoGuideNarrationStorageError(
      "TTS_OUTPUT_DOWNLOAD_FAILED",
      "语音文件下载失败，请稍后重试",
      Boolean(response && retryableHttpStatus(response.status))
    );
  }

  const contentType = normalizedMimeType(response.headers.get("content-type"));

  if (contentType && contentType !== audioMimeType && contentType !== "application/octet-stream") {
    throw new VideoGuideNarrationStorageError("TTS_OUTPUT_INVALID", "语音模型返回的文件类型不正确");
  }

  const contentLength = positiveInteger(response.headers.get("content-length"));

  if (contentLength > config.maxBytes) {
    throw new VideoGuideNarrationStorageError("TTS_OUTPUT_INVALID", "单句导学语音文件超过大小限制");
  }

  let bytes: Buffer;

  try {
    bytes = await responseBufferWithLimit(response, config.maxBytes);
  } catch (error) {
    if (error instanceof VideoGuideNarrationStorageError) {
      throw error;
    }

    throw new VideoGuideNarrationStorageError(
      "TTS_OUTPUT_DOWNLOAD_FAILED",
      "语音文件下载中断，请稍后重试",
      true
    );
  }

  assertValidAudioBytes(bytes, config.maxBytes);

  return bytes;
}

function allowedProviderAudioUrl(value: string, allowedHosts: string[]) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new VideoGuideNarrationStorageError("TTS_OUTPUT_INVALID", "语音模型返回的临时文件地址不正确");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const allowed = allowedHosts.some((pattern) => providerHostnameMatches(hostname, pattern));

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !hostname || !allowed) {
    throw new VideoGuideNarrationStorageError("TTS_OUTPUT_INVALID", "语音模型返回的临时文件地址不受信任");
  }

  return url.toString();
}

function providerHostnameMatches(hostname: string, patternValue: string) {
  const pattern = patternValue.trim().toLowerCase().replace(/\.$/, "");

  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    return Boolean(suffix) && hostname !== suffix && hostname.endsWith(`.${suffix}`);
  }

  return Boolean(pattern) && hostname === pattern;
}

function isRedirectResponse(response: Response) {
  return response.status >= 300 && response.status < 400;
}

async function responseBufferWithLimit(response: Response, maxBytes: number) {
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.byteLength > maxBytes) {
      throw new VideoGuideNarrationStorageError("TTS_OUTPUT_INVALID", "单句导学语音文件超过大小限制");
    }

    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let sizeBytes = 0;

  while (true) {
    const chunk = await reader.read();

    if (chunk.done) {
      break;
    }

    const bytes = Buffer.from(chunk.value);
    sizeBytes += bytes.byteLength;

    if (sizeBytes > maxBytes) {
      await reader.cancel();
      throw new VideoGuideNarrationStorageError("TTS_OUTPUT_INVALID", "单句导学语音文件超过大小限制");
    }

    chunks.push(bytes);
  }

  return Buffer.concat(chunks, sizeBytes);
}

function assertValidAudioBytes(bytes: Buffer, maxBytes: number) {
  if (bytes.byteLength <= 0) {
    throw new VideoGuideNarrationStorageError("TTS_OUTPUT_INVALID", "语音模型返回了空音频文件");
  }

  if (bytes.byteLength > maxBytes) {
    throw new VideoGuideNarrationStorageError("TTS_OUTPUT_INVALID", "单句导学语音文件超过大小限制");
  }
}

async function putR2Object(input: {
  bytes: Buffer;
  config: VideoGuideNarrationR2Config;
  fetchImpl: typeof fetch;
  objectUrl: string;
  sha256: string;
}) {
  const parsedUrl = new URL(input.objectUrl);
  const amzDate = amzTimestamp(new Date());
  const headers: Record<string, string> = {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": audioMimeType,
    host: parsedUrl.host,
    "x-amz-content-sha256": input.sha256,
    "x-amz-date": amzDate,
    "x-amz-meta-sha256": input.sha256
  };
  const authorization = signS3Request({
    accessKeyId: input.config.accessKeyId,
    secretAccessKey: input.config.secretAccessKey,
    region: input.config.region,
    method: "PUT",
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    headers,
    payloadHash: input.sha256,
    amzDate
  });
  let response: Response;

  try {
    response = await fetchWithTimeout(
      input.fetchImpl,
      input.objectUrl,
      {
        method: "PUT",
        headers: {
          ...headers,
          authorization
        },
        body: input.bytes
      },
      input.config.timeoutMs
    );
  } catch {
    throw new VideoGuideNarrationStorageError(
      "R2_UPLOAD_FAILED",
      "导学语音上传到对象存储失败，请稍后重试",
      true
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new VideoGuideNarrationStorageError("R2_VERIFY_INVALID", "导学语音对象不存在");
    }

    if (!retryableHttpStatus(response.status)) {
      throw new VideoGuideNarrationStorageError(
        "R2_CONFIG_MISSING",
        "对象存储拒绝上传，请检查语音对象存储配置"
      );
    }

    throw new VideoGuideNarrationStorageError(
      "R2_UPLOAD_FAILED",
      "导学语音上传到对象存储失败，请稍后重试",
      true
    );
  }
}

async function verifyR2Object(input: {
  config: VideoGuideNarrationR2Config;
  fetchImpl: typeof fetch;
  objectUrl: string;
  sha256: string;
  sizeBytes: number;
}) {
  const parsedUrl = new URL(input.objectUrl);
  const amzDate = amzTimestamp(new Date());
  const headers: Record<string, string> = {
    host: parsedUrl.host,
    "x-amz-content-sha256": emptyPayloadHash,
    "x-amz-date": amzDate
  };
  const authorization = signS3Request({
    accessKeyId: input.config.accessKeyId,
    secretAccessKey: input.config.secretAccessKey,
    region: input.config.region,
    method: "HEAD",
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    headers,
    payloadHash: emptyPayloadHash,
    amzDate
  });
  let response: Response;

  try {
    response = await fetchWithTimeout(
      input.fetchImpl,
      input.objectUrl,
      {
        method: "HEAD",
        headers: {
          ...headers,
          authorization
        }
      },
      input.config.timeoutMs
    );
  } catch {
    throw new VideoGuideNarrationStorageError(
      "R2_VERIFY_FAILED",
      "导学语音上传结果校验失败，请稍后重试",
      true
    );
  }

  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      throw new VideoGuideNarrationStorageError(
        "R2_VERIFY_INVALID",
        "导学语音对象已不存在，需要重新生成"
      );
    }

    if (!retryableHttpStatus(response.status)) {
      throw new VideoGuideNarrationStorageError(
        "R2_CONFIG_MISSING",
        "对象存储拒绝校验，请检查语音对象存储配置"
      );
    }

    throw new VideoGuideNarrationStorageError(
      "R2_VERIFY_FAILED",
      "导学语音上传结果校验失败，请稍后重试",
      true
    );
  }

  const contentLength = positiveInteger(response.headers.get("content-length"));
  const contentType = normalizedMimeType(response.headers.get("content-type"));
  const storedSha256 = response.headers.get("x-amz-meta-sha256")?.trim().toLowerCase() ?? "";

  if (
    contentLength !== input.sizeBytes ||
    contentType !== audioMimeType ||
    storedSha256 !== input.sha256.toLowerCase()
  ) {
    throw new VideoGuideNarrationStorageError("R2_VERIFY_INVALID", "导学语音上传结果与源文件不一致");
  }
}

async function retryTransientPersistenceOperation<T>(operation: () => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= persistenceMaxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (
        !(error instanceof VideoGuideNarrationStorageError) ||
        !error.retryable ||
        attempt >= persistenceMaxAttempts
      ) {
        throw error;
      }

      await delay(persistenceRetryBaseDelayMs * attempt);
    }
  }

  throw lastError;
}

function retryableHttpStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function delay(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

async function deleteR2Object(input: {
  config: VideoGuideNarrationR2Config;
  fetchImpl: typeof fetch;
  objectUrl: string;
}) {
  const parsedUrl = new URL(input.objectUrl);
  const amzDate = amzTimestamp(new Date());
  const headers: Record<string, string> = {
    host: parsedUrl.host,
    "x-amz-content-sha256": emptyPayloadHash,
    "x-amz-date": amzDate
  };
  const authorization = signS3Request({
    accessKeyId: input.config.accessKeyId,
    secretAccessKey: input.config.secretAccessKey,
    region: input.config.region,
    method: "DELETE",
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    headers,
    payloadHash: emptyPayloadHash,
    amzDate
  });
  let response: Response;

  try {
    response = await fetchWithTimeout(
      input.fetchImpl,
      input.objectUrl,
      {
        method: "DELETE",
        headers: {
          ...headers,
          authorization
        }
      },
      input.config.timeoutMs
    );
  } catch {
    throw new VideoGuideNarrationStorageError("R2_CLEANUP_FAILED", "导学语音对象清理失败");
  }

  if (!response.ok) {
    throw new VideoGuideNarrationStorageError("R2_CLEANUP_FAILED", "导学语音对象清理失败");
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildObjectKey(prefix: string, request: VideoGuideNarrationPersistenceRequest) {
  const safePrefix = normalizedPrefix(prefix);
  const namespace = request.namespace ? `${safeObjectSegment(request.namespace)}/` : "";
  const lessonId = safeObjectSegment(request.lessonId);
  const generationId = safeObjectSegment(request.generationId);
  const nodeId = safeObjectSegment(request.nodeId);
  const audioTaskId = safeObjectSegment(request.audioTaskId);

  return `${safePrefix}${namespace}${lessonId}/${generationId}/${nodeId}-${audioTaskId}.mp3`;
}

function safeObjectSegment(value: string) {
  const segment = value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!segment) {
    throw new VideoGuideNarrationStorageError("TTS_OUTPUT_INVALID", "导学语音对象标识不正确");
  }

  return segment;
}

function buildR2ObjectUrl(config: VideoGuideNarrationR2Config, objectKey: string) {
  const endpoint = config.endpoint.replace(/\/+$/, "");

  return config.pathStyle
    ? `${endpoint}/${config.bucket}/${objectKey}`
    : `${endpoint.replace("://", `://${config.bucket}.`)}/${objectKey}`;
}

function normalizeConfig(config: VideoGuideNarrationR2Config): VideoGuideNarrationR2Config {
  const normalized = {
    ...config,
    endpoint: config.endpoint.trim().replace(/\/+$/, ""),
    bucket: config.bucket.trim(),
    region: config.region.trim() || "auto",
    accessKeyId: config.accessKeyId.trim(),
    secretAccessKey: config.secretAccessKey.trim(),
    publicBaseUrl: config.publicBaseUrl.trim().replace(/\/+$/, ""),
    prefix: normalizedPrefix(config.prefix),
    maxBytes: positiveConfigInteger(config.maxBytes, defaultMaxBytes),
    timeoutMs: positiveConfigInteger(config.timeoutMs, defaultTimeoutMs),
    providerDownloadAllowedHosts: normalizedProviderDownloadAllowedHosts(config.providerDownloadAllowedHosts)
  };

  if (
    !normalized.endpoint ||
    !normalized.bucket ||
    !normalized.accessKeyId ||
    !normalized.secretAccessKey ||
    !normalized.publicBaseUrl
  ) {
    throw new VideoGuideNarrationStorageError("R2_CONFIG_MISSING", "视频导学语音对象存储配置不完整");
  }

  try {
    new URL(normalized.endpoint);
    new URL(normalized.publicBaseUrl);
  } catch {
    throw new VideoGuideNarrationStorageError("R2_CONFIG_MISSING", "视频导学语音对象存储地址配置不正确");
  }

  return normalized;
}

function videoGuideNarrationR2ConfigFromEnv(): VideoGuideNarrationR2Config {
  return {
    endpoint: envValue("VIDEO_GUIDE_R2_ENDPOINT", "S3_ENDPOINT"),
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET?.trim() || process.env.S3_BUCKET?.trim() || "xueleai",
    region: process.env.VIDEO_GUIDE_R2_REGION?.trim() || process.env.S3_REGION?.trim() || "auto",
    accessKeyId: envValue("VIDEO_GUIDE_R2_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID"),
    secretAccessKey: envValue("VIDEO_GUIDE_R2_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY"),
    publicBaseUrl:
      process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL?.trim() || process.env.S3_PUBLIC_BASE_URL?.trim() || "",
    pathStyle: (process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE ?? process.env.S3_FORCE_PATH_STYLE ?? "1") !== "0",
    prefix: process.env.VIDEO_GUIDE_R2_NARRATION_PREFIX?.trim() || "video-guide/narration/",
    maxBytes: positiveInteger(process.env.VIDEO_GUIDE_NARRATION_AUDIO_MAX_BYTES) || defaultMaxBytes,
    timeoutMs: positiveInteger(process.env.VIDEO_GUIDE_R2_REQUEST_TIMEOUT_MS) || defaultTimeoutMs,
    providerDownloadAllowedHosts: (
      process.env.VIDEO_GUIDE_TTS_DOWNLOAD_ALLOWED_HOSTS?.split(",") ?? defaultProviderDownloadAllowedHosts
    )
  };
}

function envValue(primary: string, fallback: string) {
  return process.env[primary]?.trim() || process.env[fallback]?.trim() || "";
}

function normalizedPrefix(value: string) {
  const prefix = value.trim().replace(/^\/+/, "").replace(/\/{2,}/g, "/");

  if (
    !prefix ||
    !/^[a-z0-9][a-z0-9._/-]*$/i.test(prefix) ||
    prefix.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new VideoGuideNarrationStorageError("R2_CONFIG_MISSING", "视频导学语音存储目录配置不正确");
  }

  return prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
}

function normalizedProviderDownloadAllowedHosts(values: string[]) {
  const normalized = values.map((value) => value.trim().toLowerCase()).filter(Boolean);

  if (normalized.length === 0 || normalized.some((value) => !/^(?:\*\.)?[a-z0-9.-]+$/.test(value))) {
    throw new VideoGuideNarrationStorageError("R2_CONFIG_MISSING", "语音临时文件主机白名单配置不正确");
  }

  return Array.from(new Set(normalized));
}

function normalizedMimeType(value: string | null) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: string | null | undefined) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function positiveConfigInteger(value: number, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function amzTimestamp(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signS3Request(input: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  method: string;
  pathname: string;
  search: string;
  headers: Record<string, string>;
  payloadHash: string;
  amzDate: string;
}) {
  const date = input.amzDate.slice(0, 8);
  const sortedHeaderNames = Object.keys(input.headers).sort();
  const signedHeaders = sortedHeaderNames.join(";");
  const canonicalHeaders = sortedHeaderNames.map((key) => `${key}:${input.headers[key]}`).join("\n");
  const canonicalRequest = [
    input.method,
    canonicalS3Path(input.pathname),
    input.search.replace(/^\?/, ""),
    `${canonicalHeaders}\n`,
    signedHeaders,
    input.payloadHash
  ].join("\n");
  const credentialScope = `${date}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, date), input.region), "s3"),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function canonicalS3Path(pathname: string) {
  return pathname
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)).replace(/[!'()*]/g, percentEncodeCharacter))
    .join("/");
}

function percentEncodeCharacter(value: string) {
  return `%${value.charCodeAt(0).toString(16).toUpperCase()}`;
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}
