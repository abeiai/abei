import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function proxyUpload(request: Request, path: string) {
  const contentType = request.headers.get("content-type");

  if (!request.body || !contentType?.includes("multipart/form-data")) {
    return Response.json(
      {
        code: 40001,
        message: "请选择要上传的文件",
        data: null
      },
      {
        status: 400
      }
    );
  }

  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
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

export function POST(request: Request) {
  return proxyUpload(request, "/video-guide/uploads/media");
}
