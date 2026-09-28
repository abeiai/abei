import { headers } from "next/headers";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const safeFilename = encodeURIComponent(filename);
  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}/fonts/files/${safeFilename}`, {
    cache: "no-store",
    headers: {
      Cookie: requestHeaders.get("cookie") ?? ""
    }
  });
  const payload = await response.arrayBuffer();
  const responseHeaders = new Headers();

  responseHeaders.set("Content-Type", response.headers.get("Content-Type") ?? "font/ttf");
  responseHeaders.set("Cache-Control", response.headers.get("Cache-Control") ?? "public, max-age=31536000, immutable");

  const contentLength = response.headers.get("Content-Length");
  if (contentLength) {
    responseHeaders.set("Content-Length", contentLength);
  }

  return new Response(payload, {
    status: response.status,
    headers: responseHeaders
  });
}
