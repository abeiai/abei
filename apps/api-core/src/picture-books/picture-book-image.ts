import { AppException } from "../common/app-exception.js";
import { inspectImage } from "../media/image-inspection.js";
import type { UploadedFileLike } from "../media/media.service.js";

export function inspectPictureBookImage(file: UploadedFileLike | undefined) {
  if (!file) throw new AppException(40001, "请选择图片文件");
  if (file.buffer.length === 0 || file.buffer.length > 10 * 1024 * 1024) {
    throw new AppException(40001, "图片大小须在 10MB 以内");
  }
  const detected = inspectImage(file.buffer);
  if (!detected || detected.mimeType !== file.mimetype) {
    throw new AppException(40001, "请上传有效的 JPG、PNG 或 WebP 图片");
  }
  if (detected.width > 8192 || detected.height > 8192) {
    throw new AppException(40001, "图片尺寸不能超过 8192 像素");
  }
  return file;
}
