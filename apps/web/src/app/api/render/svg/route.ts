import { headers } from "next/headers";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function POST(request: Request) {
  const body = await request.text();
  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}/render/svg`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: requestHeaders.get("cookie") ?? ""
    },
    body,
    cache: "no-store"
  });
  const payload = await response.text();

  return new Response(payload, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
