export interface StudentPhotoCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function clampStudentPhotoAdjustment(zoom: number, verticalPosition: number, horizontalPosition = 0) {
  return {
    zoom: Number.isFinite(zoom) ? Math.max(1, Math.min(2.5, zoom)) : 1,
    verticalPosition: Number.isFinite(verticalPosition) ? Math.max(-1, Math.min(1, verticalPosition)) : 0,
    horizontalPosition: Number.isFinite(horizontalPosition) ? Math.max(-1, Math.min(1, horizontalPosition)) : 0
  };
}

export function calculateStudentPhotoCrop(
  sourceWidth: number,
  sourceHeight: number,
  widthMm: number,
  heightMm: number,
  zoom: number,
  verticalPosition: number,
  horizontalPosition = 0
): StudentPhotoCrop {
  if (sourceWidth <= 0 || sourceHeight <= 0 || widthMm <= 0 || heightMm <= 0) {
    throw new Error("照片尺寸无效");
  }
  const adjustment = clampStudentPhotoAdjustment(zoom, verticalPosition, horizontalPosition);
  const targetRatio = widthMm / heightMm;
  const baseWidth = Math.min(sourceWidth, sourceHeight * targetRatio);
  const baseHeight = baseWidth / targetRatio;
  const width = baseWidth / adjustment.zoom;
  const height = baseHeight / adjustment.zoom;
  return {
    left: (sourceWidth - width) * (adjustment.horizontalPosition + 1) / 2,
    top: (sourceHeight - height) * (adjustment.verticalPosition + 1) / 2,
    width,
    height
  };
}
