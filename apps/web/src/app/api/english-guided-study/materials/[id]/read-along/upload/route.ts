import { headers } from "next/headers";
import { englishGuidedStudyReadAlongUploadMaxBytes } from "@/lib/english-guided-study-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestHeaders = await headers();
  const { id } = await params;
  // Leave room for multipart fields; the API enforces the file's own size.
  const maxRequestBytes = englishGuidedStudyReadAlongUploadMaxBytes + 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  let response: Response;

  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
    return Response.json(
      {
        code: 40001,
        message: "跟读音频不能超过 30 MB",
        data: null
      },
      {
        status: 413
      }
    );
  }

  try {
    response = await fetch(
      `${getApiBaseUrl()}/english-guided-study/materials/${encodeURIComponent(id)}/read-along/upload`,
      {
        method: "POST",
        headers: {
          "Content-Type": request.headers.get("content-type") ?? "multipart/form-data",
          Cookie: requestHeaders.get("cookie") ?? ""
        },
        body: request.body,
        duplex: "half",
        cache: "no-store"
      } as RequestInit & { duplex: "half" }
    );
  } catch {
    return Response.json(
      {
        code: 50301,
        message: "跟读音频上传服务暂不可用",
        data: null
      },
      {
        status: 503
      }
    );
  }

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}
