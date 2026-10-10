export const pictureBookAspectRatios = ["21:10", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"] as const;
export type PictureBookAspectRatio = typeof pictureBookAspectRatios[number];

const imageSizes: Record<PictureBookAspectRatio, { width: number; height: number }> = {
  "21:10": { width: 1680, height: 800 },
  "16:9": { width: 1536, height: 864 },
  "3:2": { width: 1536, height: 1024 },
  "4:3": { width: 1536, height: 1152 },
  "5:4": { width: 1280, height: 1024 },
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 1024, height: 1280 },
  "3:4": { width: 1152, height: 1536 },
  "2:3": { width: 1024, height: 1536 },
  "9:16": { width: 864, height: 1536 }
};

export function pictureBookPageAspectRatio(aspectRatio: string, isSpread = false, position = 1) {
  const ratio = Object.hasOwn(imageSizes, aspectRatio) ? aspectRatio : "1:1";
  if (!isSpread || position === 0) return ratio;
  const [width, height] = ratio.split(":").map(Number);
  return `${width * 2}:${height}`;
}

export function pictureBookImageSize(aspectRatio: string, isSpread = false, position = 1) {
  const size = Object.hasOwn(imageSizes, aspectRatio) ? imageSizes[aspectRatio as PictureBookAspectRatio] : imageSizes["1:1"];
  return isSpread && position > 0 ? { width: size.width * 2, height: size.height } : size;
}
