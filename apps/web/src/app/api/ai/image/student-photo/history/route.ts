import { headers } from "next/headers";

export async function GET(request: Request) {
  const requestHeaders = await headers();
  const cursor = new URL(request.url).searchParams.get("cursor");
  const url = `${process.env.API_BASE_URL ?? "http://localhost:3322/api"}/ai/image/student-photo/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
  const response = await fetch(url, { headers: { Cookie: requestHeaders.get("cookie") ?? "" }, cache: "no-store" });
  return new Response(await response.text(), { status: response.status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });
}
