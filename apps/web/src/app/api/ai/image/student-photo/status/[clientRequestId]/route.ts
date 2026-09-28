import { headers } from "next/headers";

export async function GET(_request: Request, context: { params: Promise<{ clientRequestId: string }> }) {
  const { clientRequestId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(clientRequestId)) return Response.json({ code: 40001, message: "任务标识无效", data: null }, { status: 400 });
  const requestHeaders = await headers();
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3322/api"}/ai/image/student-photo/status/${clientRequestId}`, {
    headers: { Cookie: requestHeaders.get("cookie") ?? "" }, cache: "no-store"
  });
  return new Response(await response.text(), { status: response.status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });
}
