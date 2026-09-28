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

export async function PUT(request: Request) {
  const response = await fetch(`${getApiBaseUrl()}/page-compositions/target`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: await getCookieHeader()
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
