interface VideoGuideAsrCacheAssetLike {
  asrMimeType?: string | null;
  asrObjectKey?: string | null;
  asrPreparedAt?: Date | string | null;
  asrSizeBytes?: number | null;
}

export interface VideoGuideAsrCache {
  mimeType: string;
  objectKey: string;
  sizeBytes: number;
}

export function videoGuideAsrCacheFromAsset(
  asset: VideoGuideAsrCacheAssetLike
): VideoGuideAsrCache | null {
  const objectKey = asset.asrObjectKey?.trim();
  const mimeType = asset.asrMimeType?.trim();
  const sizeBytes = asset.asrSizeBytes;

  if (
    !objectKey ||
    !mimeType ||
    !asset.asrPreparedAt ||
    typeof sizeBytes !== "number" ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0
  ) {
    return null;
  }

  return {
    mimeType,
    objectKey,
    sizeBytes
  };
}

export function videoGuideAsrCacheObjectKey(hash: string) {
  const normalized = hash.trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("无效的媒体文件哈希");
  }

  return `video-guide/asr-cache/sha256/${normalized.slice(0, 2)}/${normalized}.m4a`;
}
