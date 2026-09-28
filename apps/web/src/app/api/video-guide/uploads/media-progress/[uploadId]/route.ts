import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function GET(_request: Request, { params }: { params: Promise<{ uploadId: string }> }) {
  const { uploadId } = await params;
  const requestHeaders = await headers();
  const response = await fetch(
    `${getApiBaseUrl()}/video-guide/uploads/media-progress/${encodeURIComponent(uploadId)}`,
    {
      cache: "no-store",
      headers: {
        Cookie: requestHeaders.get("cookie") ?? ""
      }
    }
  );

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}
