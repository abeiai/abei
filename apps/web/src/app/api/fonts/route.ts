import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function GET() {
  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}/fonts`, {
    cache: "no-store",
    headers: {
      Cookie: requestHeaders.get("cookie") ?? ""
    }
  });
  const payload = await response.text();

  return new Response(payload, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type");

  if (!request.body || !contentType?.includes("multipart/form-data")) {
    return Response.json(
      {
        code: 40001,
        message: "请选择字体文件",
        data: null
      },
      {
        status: 400
      }
    );
  }

  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}/fonts`, {
    body: request.body,
    cache: "no-store",
    duplex: "half",
    headers: {
      "Content-Type": contentType,
      Cookie: requestHeaders.get("cookie") ?? ""
    },
    method: "POST"
  } as RequestInit & { duplex: "half" });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}
