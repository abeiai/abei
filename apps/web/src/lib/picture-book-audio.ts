export function pictureBookPageAudioSource(bookId: string, position: number, audioUrl: string, scope: "private" | "public" = "private", language?: string) {
  if (scope === "private" && audioUrl.startsWith("/") && (!language || audioUrl.startsWith("/api/creator-media/items/"))) return audioUrl;
  try {
    const legacy = new URL(audioUrl);
    if (!language && scope === "private" && /^\/api\/audio\/files\/[a-zA-Z0-9._-]+$/.test(legacy.pathname)) return legacy.pathname;
  } catch { /* 无效地址由站内接口返回错误。 */ }
  const version = audioUrl.split("?")[0]!.split("/").at(-1) ?? "";
  return `/api/${scope === "public" ? "public/" : ""}picture-books/${encodeURIComponent(bookId)}/pages/${position}/audio?${language ? `language=${encodeURIComponent(language)}&` : ""}v=${encodeURIComponent(version)}`;
}

export function waitForPictureBookAudio(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const finish = (failed: boolean) => {
      clearTimeout(timer);
      audio.oncanplay = null;
      audio.onerror = null;
      if (failed) reject(new Error("语音已生成并保存，但加载失败。请重试加载。"));
      else resolve();
    };
    // Allow the API's three bounded R2 transfer attempts to finish.
    const timer = setTimeout(() => finish(true), 365_000);
    audio.oncanplay = () => finish(false);
    audio.onerror = () => finish(true);
    audio.preload = "auto";
    audio.src = src;
  });
}
