type StoredMediaAsset = {
  filename?: string;
  storageProvider?: string;
  url: string;
};

export function mediaStoragePublicBaseUrl() {
  return (
    process.env.S3_PUBLIC_BASE_URL?.trim()
    || process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL?.trim()
    || ""
  ).replace(/\/+$/, "");
}

export function mediaAssetPublicUrl(asset: StoredMediaAsset) {
  const publicBaseUrl = mediaStoragePublicBaseUrl();

  if (asset.storageProvider !== "S3" || !asset.filename || !publicBaseUrl) {
    return asset.url;
  }

  const prefix = (process.env.S3_KEY_PREFIX ?? "uploads/")
    .trim()
    .replace(/^\/+|\/+$/g, "");

  return `${publicBaseUrl}/${prefix ? `${prefix}/` : ""}${asset.filename}`;
}
