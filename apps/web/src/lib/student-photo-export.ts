import sharp from "sharp";
import { calculateStudentPhotoCrop } from "./student-photo-crop";

export function photoPixels(mm: number) {
  return Math.round(mm * 300 / 25.4);
}

export type StudentPhotoFormat = "jpg" | "png";

export async function renderStudentPhoto(source: Buffer, widthMm: number, heightMm: number, zoom = 1, verticalPosition = 0, horizontalPosition = 0, format: StudentPhotoFormat = "png") {
  const image = sharp(source, { limitInputPixels: 50_000_000 });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("照片尺寸无效");
  const crop = calculateStudentPhotoCrop(metadata.width, metadata.height, widthMm, heightMm, zoom, verticalPosition, horizontalPosition);
  const width = Math.max(1, Math.min(metadata.width, Math.round(crop.width)));
  const height = Math.max(1, Math.min(metadata.height, Math.round(crop.height)));
  const resized = image
    .extract({
      left: Math.max(0, Math.min(metadata.width - width, Math.round(crop.left))),
      top: Math.max(0, Math.min(metadata.height - height, Math.round(crop.top))),
      width,
      height
    })
    .resize(photoPixels(widthMm), photoPixels(heightMm));
  return (format === "jpg" ? resized.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }) : resized.png())
    .withMetadata({ density: 300 }).toBuffer();
}

export function renderStudentPhotoPng(source: Buffer, widthMm: number, heightMm: number, zoom = 1, verticalPosition = 0, horizontalPosition = 0) {
  return renderStudentPhoto(source, widthMm, heightMm, zoom, verticalPosition, horizontalPosition, "png");
}
