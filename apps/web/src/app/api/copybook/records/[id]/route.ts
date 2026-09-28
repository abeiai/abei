import { headers } from "next/headers";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}/copybooks/${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: {
      Cookie: requestHeaders.get("cookie") ?? ""
    },
    method: "DELETE"
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
