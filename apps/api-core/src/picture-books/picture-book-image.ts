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

export function assertPictureBookGeneratedImageUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppException(50201, "生成图片地址无效");
  }
  const hosts = (process.env.PICTURE_BOOK_IMAGE_ALLOWED_HOSTS ?? "*.aliyuncs.com,dmx04.sdts.net.cn,ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com,ark-content-generation-cn-beijing.tos-cn-beijing.volces.com,ark-acg-cn-beijing.tos-cn-beijing.volces.com")
    .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  const hostname = url.hostname.toLowerCase();
  const trusted = hosts.some((host) => host.startsWith("*.")
    ? hostname.endsWith(host.slice(1)) && hostname !== host.slice(2)
    : hostname === host);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !trusted ||
      (hostname === "dmx04.sdts.net.cn" && !url.pathname.startsWith("/dl/images/"))) {
    throw new AppException(50201, "生成图片地址无效");
  }
  return url.toString();
}
