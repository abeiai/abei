import { headers } from "next/headers";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function POST(request: Request) {
  const body = await request.text();
  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}/render/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: requestHeaders.get("cookie") ?? ""
    },
    body,
    cache: "no-store"
  });
  const payload = await response.arrayBuffer();
  const responseHeaders = new Headers();

  responseHeaders.set("Content-Type", response.headers.get("Content-Type") ?? "application/pdf");
  responseHeaders.set("Cache-Control", "no-store");

  const disposition = response.headers.get("Content-Disposition");
  if (disposition) {
    responseHeaders.set("Content-Disposition", disposition);
  }

  return new Response(payload, {
    status: response.status,
    headers: responseHeaders
  });
}
