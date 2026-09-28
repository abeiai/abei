import { headers } from "next/headers";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const url = new URL(request.url);
  const response = await fetch(
    `${getApiBaseUrl()}/copybooks/${encodeURIComponent(id)}/pdf${url.searchParams.get("download") === "1" ? "?download=1" : ""}`,
    {
      cache: "no-store",
      headers: {
        Cookie: requestHeaders.get("cookie") ?? ""
      }
    }
  );
  const responseHeaders = new Headers();

  responseHeaders.set("Content-Type", response.headers.get("content-type") ?? "application/pdf");
  responseHeaders.set("Cache-Control", "no-store");

  const disposition = response.headers.get("content-disposition");
  if (disposition) {
    responseHeaders.set("Content-Disposition", disposition);
  }

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: responseHeaders
  });
}
