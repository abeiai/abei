const sourceOrigin = "https://r.abeiai.com";
const cdnOrigin = "https://cc.abeiai.com";
const publicMediaExtension = /\.(?:png|jpe?g|webp|gif|svg|avif|ico|mp3|wav|ogg|aac|m4a|flac|opus)$/i;
const signedParameter = /signature|token|credential|authorization|accesskey|keypair|policy|expires|jwt|hmac|secret|ticket|verify|^sign$|^sig$|^auth|^x(?:amz|goog|cos)|^qsign/i;

export function hasSignedUrlParameters(source: string): boolean {
  try {
    return [...new URL(source, "https://local.invalid").searchParams.keys()].some(key => signedParameter.test(key.replace(/[-_]/g, "")));
  } catch {
    return false;
  }
}

export function publicR2CdnUrl(source: string): string {
  if (!source.startsWith(`${sourceOrigin}/`)) return source;
  try {
    const url = new URL(source);
    if (url.origin !== sourceOrigin || url.username || url.password || !publicMediaExtension.test(url.pathname)) return source;
    if (hasSignedUrlParameters(source)) return source;
    return `${cdnOrigin}${source.slice(sourceOrigin.length)}`;
  } catch {
    return source;
  }
}
