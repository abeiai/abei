import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function proxy(request: Request, method: "GET" | "POST") {
  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}/video-guide/lessons`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: requestHeaders.get("cookie") ?? ""
    },
    body: method === "POST" ? await request.text() : undefined,
    cache: "no-store"
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}

export function GET(request: Request) {
  return proxy(request, "GET");
}

export function POST(request: Request) {
  return proxy(request, "POST");
}
