import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function GET() {
  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}/page-compositions`, {
    headers: {
      Cookie: requestHeaders.get("cookie") ?? ""
    },
    cache: "no-store"
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}
