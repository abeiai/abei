import type { ActionResult } from "./course-types";

type UploadedCover = { id: string; url: string };
const fallback = "专辑封面上传失败，请稍后重试。";

export async function uploadCourseCover(blob: Blob): Promise<ActionResult<UploadedCover>> {
  const body = new FormData();
  body.append("file", new File([blob], "course-cover.jpg", { type: "image/jpeg" }));
  let response: Response;
  try {
    response = await fetch("/api/courses/cover", {
      method: "POST", credentials: "include", cache: "no-store", body
    });
  } catch {
    return { ok: false, message: "网络连接失败，请检查网络后重新上传封面。" };
  }
  const payload = await response.json().catch(() => null) as {
    code?: number; message?: unknown; data?: Partial<UploadedCover> | null;
  } | null;
  if (response.ok && payload?.code === 0 && typeof payload.data?.id === "string" && typeof payload.data?.url === "string" && payload.data.id && payload.data.url) {
    return { ok: true, data: { id: payload.data.id, url: payload.data.url }, message: "专辑封面已上传。" };
  }
  if (response.status === 401) return { ok: false, message: "登录已失效，请重新登录后上传封面。" };
  if (response.status === 413) return { ok: false, message: "封面图片过大，请压缩后重新上传。" };
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";
  const safeMessage = message.length <= 200 && /[\u3400-\u9fff]/u.test(message)
    && !/internal server error|prisma|sql|jwt|stack|trace|exception|\berror\b|[\r\n]/iu.test(message);
  return { ok: false, message: safeMessage ? message : fallback };
}
