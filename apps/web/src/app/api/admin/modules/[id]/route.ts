import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function proxy(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  method: "GET" | "PATCH" | "DELETE"
) {
  const requestHeaders = await headers();
  const { id } = await params;
  const response = await fetch(`${getApiBaseUrl()}/content-modules/${encodeURIComponent(id)}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: requestHeaders.get("cookie") ?? ""
    },
    body: method === "PATCH" ? await request.text() : undefined,
    cache: "no-store"
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return proxy(request, context, "GET");
}

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return proxy(request, context, "PATCH");
}

export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return proxy(request, context, "DELETE");
}
