import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestHeaders = await headers();
  const { id } = await params;
  const response = await fetch(`${getApiBaseUrl()}/video-guide/lessons/${encodeURIComponent(id)}/practice`, {
    body: await request.text(),
    cache: "no-store",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      Cookie: requestHeaders.get("cookie") ?? ""
    },
    method: "POST"
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}
