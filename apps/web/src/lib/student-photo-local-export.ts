import { calculateStudentPhotoCrop } from "./student-photo-crop";
import type { StudentPhotoFormat } from "./student-photo-export";

const dpi = 300;

export function photoPixels(mm: number) {
  return Math.round(mm * dpi / 25.4);
}

export async function cropLocalStudentPhoto(image: HTMLImageElement, widthMm: number, heightMm: number, zoom: number, verticalPosition: number, horizontalPosition = 0, format: StudentPhotoFormat = "png") {
  const crop = calculateStudentPhotoCrop(image.naturalWidth, image.naturalHeight, widthMm, heightMm, zoom, verticalPosition, horizontalPosition);
  const canvas = document.createElement("canvas");
  canvas.width = photoPixels(widthMm);
  canvas.height = photoPixels(heightMm);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("照片处理失败，请重试");
  if (format === "jpg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, crop.left, crop.top, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("照片导出失败，请重试")),
      format === "jpg" ? "image/jpeg" : "image/png", 0.95)
  );
  return format === "jpg" ? withJpegDpi(blob, dpi) : withPngDpi(blob, dpi);
}

export async function withJpegDpi(blob: Blob, targetDpi: number) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("照片格式无效");
  const density = Math.max(1, Math.min(65535, Math.round(targetDpi)));
  const existingJfif = bytes.length >= 20 && bytes[2] === 0xff && bytes[3] === 0xe0 &&
    bytes[6] === 0x4a && bytes[7] === 0x46 && bytes[8] === 0x49 && bytes[9] === 0x46 && bytes[10] === 0;
  if (existingJfif) {
    bytes[13] = 1;
    bytes[14] = density >>> 8; bytes[15] = density & 0xff;
    bytes[16] = density >>> 8; bytes[17] = density & 0xff;
    return new Blob([bytes], { type: "image/jpeg" });
  }
  const jfif = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1,
    density >>> 8, density & 0xff, density >>> 8, density & 0xff, 0, 0]);
  return new Blob([bytes.subarray(0, 2), jfif, bytes.subarray(2)], { type: "image/jpeg" });
}

export async function withPngDpi(blob: Blob, targetDpi: number) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 ||
      bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10 ||
      new DataView(bytes.buffer, bytes.byteOffset).getUint32(8) !== 13 ||
      bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) {
    throw new Error("照片格式无效");
  }
  const pixelsPerMeter = Math.round(targetDpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  view.setUint32(8, pixelsPerMeter);
  view.setUint32(12, pixelsPerMeter);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return new Blob([bytes.subarray(0, 33), chunk, bytes.subarray(33)], { type: "image/png" });
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
