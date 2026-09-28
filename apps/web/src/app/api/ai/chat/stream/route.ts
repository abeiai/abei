import { headers } from "next/headers";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function POST(request: Request) {
  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}/ai/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Cookie: requestHeaders.get("cookie") ?? ""
    },
    body: await request.text(),
    cache: "no-store"
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform"
    }
  });
}
