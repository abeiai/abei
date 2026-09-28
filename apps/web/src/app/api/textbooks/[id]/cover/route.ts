export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await fetch(`${getApiBaseUrl()}/public/textbooks/${encodeURIComponent(id)}/cover`, {
    cache: "no-store"
  });
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const contentLength = response.headers.get("content-length");
  const contentDisposition = response.headers.get("content-disposition");

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  if (contentDisposition) {
    headers.set("Content-Disposition", contentDisposition);
  }

  headers.set("Cache-Control", response.ok ? "public, max-age=86400" : "no-store");

  return new Response(response.body, {
    headers,
    status: response.status
  });
}
