import { headers } from "next/headers";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function POST(request: Request) {
  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}/ai/video/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: requestHeaders.get("cookie") ?? ""
    },
    body: await request.text(),
    cache: "no-store"
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}
