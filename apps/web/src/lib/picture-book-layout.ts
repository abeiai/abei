export type PictureBookPlaybackLayout = "subtitle" | "side" | "below" | "hidden";

export function pictureBookPageRatio(aspectRatio: string, isSpread = false, position = 1) {
  const [width, height] = aspectRatio.split(":").map(Number);
  const singleRatio = width > 0 && height > 0 && Number.isFinite(width / height) ? width / height : 1;
  return singleRatio * (isSpread && position > 0 ? 2 : 1);
}

export function pictureBookPlaybackLayout(layout: PictureBookPlaybackLayout, isSpread = false): PictureBookPlaybackLayout {
  return isSpread && layout === "side" ? "subtitle" : layout;
}
