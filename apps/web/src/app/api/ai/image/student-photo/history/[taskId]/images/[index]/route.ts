import { headers } from "next/headers";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string; index: string }> }) {
  const { taskId, index } = await context.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId) || !/^[12]$/.test(index)) return new Response("图片地址无效", { status: 400 });
  const requestHeaders = await headers();
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3322/api"}/ai/image/student-photo/history/${taskId}/images/${index}`,
    { headers: { Cookie: requestHeaders.get("cookie") ?? "" }, cache: "no-store" });
  return new Response(response.body, { status: response.status, headers: {
    "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
    "Cache-Control": "private, no-store"
  } });
}
