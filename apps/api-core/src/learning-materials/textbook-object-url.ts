const defaultTextbookCdnBaseUrl = "https://cdn.xueleai.com";
const textbookObjectPrefix = "learning-materials/textbooks/";

export function textbookCdnBaseUrl() {
  return (
    process.env.TEXTBOOK_CDN_BASE_URL ||
    process.env.S3_PUBLIC_BASE_URL ||
    defaultTextbookCdnBaseUrl
  ).replace(/\/+$/, "");
}

export function publicTextbookObjectUrl(objectKey: string, cdnBaseUrl = textbookCdnBaseUrl()) {
  return `${cdnBaseUrl.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
}

export function publicTextbookObjectUrlFromStoredUrl(value: null | string, cdnBaseUrl = textbookCdnBaseUrl()) {
  if (!value) {
    return null;
  }

  const objectKey = textbookObjectKeyFromUrl(value);

  return objectKey ? publicTextbookObjectUrl(objectKey, cdnBaseUrl) : null;
}

export function isPrivateR2Url(value: string) {
  try {
    const { hostname } = new URL(value);

    return hostname.endsWith(".r2.cloudflarestorage.com") || hostname === "r2.cloudflarestorage.com";
  } catch {
    return false;
  }
}

function textbookObjectKeyFromUrl(value: string) {
  if (value.startsWith(textbookObjectPrefix)) {
    return value;
  }

  try {
    const pathname = decodeURIComponent(new URL(value).pathname).replace(/^\/+/, "");
    const markerIndex = pathname.indexOf(textbookObjectPrefix);

    return markerIndex >= 0 ? pathname.slice(markerIndex) : null;
  } catch {
    const markerIndex = value.indexOf(textbookObjectPrefix);

    return markerIndex >= 0 ? value.slice(markerIndex) : null;
  }
}
