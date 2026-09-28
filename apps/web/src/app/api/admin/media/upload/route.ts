import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const mediaTypes = new Set(["IMAGE", "AUDIO", "VIDEO"]);

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function getCookieHeader() {
  const cookieStore = await cookies();

  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

function redirectUrl(request: Request, mediaType: string, params: Record<string, string>) {
  const url = new URL("/admin/media", request.url);
  url.searchParams.set("mediaType", mediaType);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function safeMediaType(value: string | null) {
  return value && mediaTypes.has(value) ? value : "IMAGE";
}

async function apiMessage(response: Response) {
  const text = await response.text();

  if (!text) {
    return response.statusText || "上传失败";
  }

  try {
    const payload = JSON.parse(text) as { message?: string };

    return payload.message || "上传失败";
  } catch {
    return text.slice(0, 120);
  }
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const mediaType = safeMediaType(requestUrl.searchParams.get("mediaType"));
  const contentType = request.headers.get("content-type");

  if (!request.body || !contentType?.includes("multipart/form-data")) {
    return NextResponse.redirect(
      redirectUrl(request, mediaType, {
        uploadError: "请选择要上传的文件"
      }),
      { status: 303 }
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cookie", await getCookieHeader());

  const response = await fetch(`${getApiBaseUrl()}/media/admin/upload`, {
    body: request.body,
    cache: "no-store",
    duplex: "half",
    headers,
    method: "POST"
  } as RequestInit & { duplex: "half" });

  if (!response.ok) {
    return NextResponse.redirect(
      redirectUrl(request, mediaType, {
        uploadError: await apiMessage(response)
      }),
      { status: 303 }
    );
  }

  const message = await apiMessage(response);

  if (message !== "成功") {
    return NextResponse.redirect(
      redirectUrl(request, mediaType, {
        uploadError: message
      }),
      { status: 303 }
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/media");
  revalidatePath("/admin/articles");
  revalidatePath("/admin/pages");

  return NextResponse.redirect(
    redirectUrl(request, mediaType, {
      uploaded: "1"
    }),
    { status: 303 }
  );
}
