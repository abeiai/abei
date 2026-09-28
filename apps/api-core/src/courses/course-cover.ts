import { AppException } from "../common/app-exception.js";
import { inspectImage, type ImageInfo } from "../media/image-inspection.js";

export type CourseCoverInfo = ImageInfo;

const maxCourseCoverBytes = 10 * 1024 * 1024;

export function inspectCourseCover(buffer: Buffer, declaredMimeType: string): CourseCoverInfo {
  if (buffer.length > maxCourseCoverBytes) {
    throw new AppException(40001, "封面图片不能超过 10MB");
  }

  const detected = inspectImage(buffer);

  if (!detected || detected.width <= 0 || detected.height <= 0) {
    throw new AppException(40001, "请上传有效的封面图片");
  }

  if (declaredMimeType.trim().toLowerCase() !== detected.mimeType) {
    throw new AppException(40001, "封面图片 MIME 类型与文件内容不一致");
  }

  if (detected.width * 9 !== detected.height * 16) {
    throw new AppException(40001, "封面图片比例必须为 16:9");
  }

  return detected;
}
