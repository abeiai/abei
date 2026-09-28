import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function getCookieHeader() {
  const cookieStore = await cookies();

  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

async function proxy(request: Request, method: "GET" | "POST") {
  const url = new URL(request.url);
  const response = await fetch(`${getApiBaseUrl()}/content-modules${url.search}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: await getCookieHeader()
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
