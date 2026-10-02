export const pictureBookAspectRatios = ["16:9", "4:3", "3:2", "1:1", "3:4", "2:3", "9:16"] as const;
export type PictureBookAspectRatio = typeof pictureBookAspectRatios[number];

const imageSizes: Record<PictureBookAspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1536, height: 864 },
  "4:3": { width: 1536, height: 1152 },
  "3:2": { width: 1536, height: 1024 },
  "1:1": { width: 1024, height: 1024 },
  "3:4": { width: 1152, height: 1536 },
  "2:3": { width: 1024, height: 1536 },
  "9:16": { width: 864, height: 1536 }
};

export function pictureBookImageSize(aspectRatio: string) {
  return Object.hasOwn(imageSizes, aspectRatio) ? imageSizes[aspectRatio as PictureBookAspectRatio] : imageSizes["1:1"];
}
