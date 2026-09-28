import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contentType = request.headers.get("content-type");

  if (!request.body || !contentType?.includes("multipart/form-data")) {
    return Response.json(
      {
        code: 40001,
        message: "请求参数错误",
        data: null
      },
      {
        status: 400
      }
    );
  }

  const requestHeaders = await headers();
  const response = await fetch(`${getApiBaseUrl()}/admin/fonts/${encodeURIComponent(id)}`, {
    body: request.body,
    cache: "no-store",
    duplex: "half",
    headers: {
      "Content-Type": contentType,
      Cookie: requestHeaders.get("cookie") ?? ""
    },
    method: "PATCH"
  } as RequestInit & { duplex: "half" });
  const payload = await response.text();

  if (response.ok) {
    revalidateFontPaths();
  }

  return new Response(payload, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function revalidateFontPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/fonts");
}
