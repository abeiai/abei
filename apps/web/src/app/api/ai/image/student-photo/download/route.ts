import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { headers } from "next/headers";
import { verifyStudentPhotoDownload } from "@/lib/student-photo-download-token";
import { renderStudentPhoto, type StudentPhotoFormat } from "@/lib/student-photo-export";

export async function GET(request: Request) {
  const user = await getOptionalCurrentUser();
  if (!user) return new Response("请先登录", { status: 401 });
  const params = new URL(request.url).searchParams;
  const taskId = params.get("taskId");
  const imageIndex = Number(params.get("index"));
  const stored = !!taskId && /^[a-zA-Z0-9_-]+$/.test(taskId) && [1, 2].includes(imageIndex);
  const claim = stored ? null : verifyStudentPhotoDownload(params.get("token") ?? "", user.id);
  if (!stored && !claim) return new Response("下载链接无效或已过期", { status: 403 });
  const original = params.get("original") === "1";
  const preview = params.get("preview") === "1" && !original;
  const format = params.get("format") ?? "jpg";
  const zoom = Number(params.get("zoom") ?? 1);
  const verticalPosition = Number(params.get("vertical") ?? 0);
  const horizontalPosition = Number(params.get("horizontal") ?? 0);
  const widthMm = Number(params.get("widthMm") ?? claim?.widthMm);
  const heightMm = Number(params.get("heightMm") ?? claim?.heightMm);
  if (!original && (format !== "jpg" && format !== "png" ||
      !Number.isFinite(zoom) || zoom < 1 || zoom > 2.5 ||
      !Number.isFinite(verticalPosition) || verticalPosition < -1 || verticalPosition > 1 ||
      !Number.isFinite(horizontalPosition) || horizontalPosition < -1 || horizontalPosition > 1 ||
      !Number.isFinite(widthMm) || widthMm < 15 || widthMm > 100 ||
      !Number.isFinite(heightMm) || heightMm < 15 || heightMm > 100)) {
    return new Response("裁剪参数无效", { status: 400 });
  }
  let response: Response | null;
  if (stored) {
    const requestHeaders = await headers();
    response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3322/api"}/ai/image/student-photo/history/${taskId}/images/${imageIndex}`,
      { headers: { Cookie: requestHeaders.get("cookie") ?? "" }, cache: "no-store", signal: AbortSignal.timeout(30000) }).catch(() => null);
  } else {
    let imageUrl: URL;
    try { imageUrl = new URL(claim!.url); }
    catch { return new Response("图片地址无效", { status: 400 }); }
    if (imageUrl.protocol !== "https:" || !/^(?:[a-z0-9-]+\.)+aliyuncs\.com$/i.test(imageUrl.hostname)) {
      return new Response("图片地址无效", { status: 400 });
    }
    response = await fetch(imageUrl, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30000) }).catch(() => null);
  }
  if (!response?.ok || !response.body) return new Response("图片下载失败，请稍后重试", { status: 502 });
  const contentType = response.headers.get("content-type") ?? "";
  if (!["image/png", "image/jpeg", "image/webp"].some((type) => contentType.startsWith(type)) ||
      Number(response.headers.get("content-length") ?? 0) > 20 * 1024 * 1024) {
    return new Response("图片格式无效或文件过大", { status: 502 });
  }
  let output: Buffer;
  try {
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 20 * 1024 * 1024) {
        await reader.cancel();
        return new Response("图片文件过大", { status: 502 });
      }
      chunks.push(Buffer.from(value));
    }
    const source = Buffer.concat(chunks, total);
    output = original ? source : await renderStudentPhoto(source, widthMm, heightMm, zoom,
      verticalPosition, horizontalPosition, format as StudentPhotoFormat);
  } catch { return new Response("证照处理失败，请稍后重试", { status: 502 }); }
  const sourceType = contentType.split(";")[0]?.trim();
  const extension = sourceType === "image/jpeg" ? "jpg" : sourceType === "image/webp" ? "webp" : "png";
  return new Response(new Uint8Array(output), {
    headers: {
      "Content-Type": original ? sourceType || "image/png" : format === "jpg" ? "image/jpeg" : "image/png",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="student-photo-${stored ? imageIndex : claim!.index}${original ? "-original" : ""}.${original ? extension : format}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
