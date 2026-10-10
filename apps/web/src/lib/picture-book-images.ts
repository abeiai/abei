export function pictureBookPageImageSource(bookId: string, position: number, imageUrl: string, scope: "private" | "public" = "private") {
  if (scope === "private" && imageUrl.startsWith("/")) return imageUrl;
  const version = imageUrl.split("?")[0]!.split("/").at(-1) ?? "";
  return `/api/${scope === "public" ? "public/" : ""}picture-books/${encodeURIComponent(bookId)}/pages/${position}/image?v=${encodeURIComponent(version)}`;
}

export function waitForPictureBookImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (failed: boolean) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (failed) reject(new Error("图片已生成并保存，但加载失败。请重试加载。"));
      else resolve();
    };
    // Allow the API's three bounded R2 transfer attempts to finish.
    const timer = setTimeout(() => finish(true), 365_000);
    image.onload = () => finish(false);
    image.onerror = () => finish(true);
    image.src = src;
  });
}
