import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestHeaders = await headers();
  const { id } = await params;
  const response = await fetch(`${getApiBaseUrl()}/video-guide/lessons/${encodeURIComponent(id)}`, {
    headers: {
      "Content-Type": "application/json",
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestHeaders = await headers();
  const { id } = await params;
  const response = await fetch(`${getApiBaseUrl()}/video-guide/lessons/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestHeaders = await headers();
  const { id } = await params;
  const response = await fetch(`${getApiBaseUrl()}/video-guide/lessons/${encodeURIComponent(id)}/subtitle`, {
    method: "PATCH",
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
