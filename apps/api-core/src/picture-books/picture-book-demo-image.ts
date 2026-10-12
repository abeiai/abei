import { AppException } from "../common/app-exception.js";
import { inspectPictureBookImage } from "./picture-book-image.js";

/** Only fixed bundled demo paths may be fetched from the configured internal web host. */
export async function readPictureBookDemoImage(url: string) {
    if (!/^\/picture-book-demos\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(url)) throw new AppException(40001, "绘本图片地址无效", 400);
    const base = process.env.PICTURE_BOOK_GUIDE_WEB_BASE_URL || (process.env.NODE_ENV === "production" ? "http://web:3601" : "http://localhost:3601");
    const response = await fetch(new URL(url, base), { redirect: "manual", signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body) throw new AppException(50201, "绘本图片读取失败，请重试", 502);
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > 10 * 1024 * 1024) throw new AppException(50201, "绘本图片超过 10MB", 502); chunks.push(Buffer.from(chunk)); }
    const mimetype = response.headers.get("content-type")?.split(";")[0] ?? "";
    return { buffer: inspectPictureBookImage({ originalname: url, mimetype, size, buffer: Buffer.concat(chunks) }).buffer, mimetype };
}
