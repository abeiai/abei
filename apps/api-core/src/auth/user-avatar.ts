import { AppException } from "../common/app-exception.js";
import { inspectImage, type ImageInfo } from "../media/image-inspection.js";

const maxUserAvatarBytes = 5 * 1024 * 1024;

export function inspectUserAvatar(buffer: Buffer, declaredMimeType: string): ImageInfo {
  if (buffer.length > maxUserAvatarBytes) {
    throw new AppException(40001, "头像图片不能超过 5MB");
  }

  const detected = inspectImage(buffer);

  if (!detected) {
    throw new AppException(40001, "请上传有效的头像图片");
  }

  if (declaredMimeType.trim().toLowerCase() !== detected.mimeType) {
    throw new AppException(40001, "头像图片 MIME 类型与文件内容不一致");
  }

  return detected;
}
