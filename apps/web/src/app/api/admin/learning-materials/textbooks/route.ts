import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

async function proxyMultipart(request: Request, path: string, method: "POST" | "PATCH") {
  const contentType = request.headers.get("content-type");

  if (!request.body || !contentType?.includes("multipart/form-data")) {
    return Response.json(
      {
        code: 40001,
        message: "请填写教材信息",
        data: null
      },
      { status: 400 }
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cookie", await getCookieHeader());

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    body: request.body,
    cache: "no-store",
    duplex: "half",
    headers,
    method
  } as RequestInit & { duplex: "half" });
  const text = await response.text();

  if (response.ok) {
    revalidatePath("/admin");
    revalidatePath("/admin/learning-materials/textbooks");
  }

  return new Response(text, {
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    },
    status: response.status
  });
}

export async function POST(request: Request) {
  return proxyMultipart(request, "/admin/learning-materials/textbooks", "POST");
}
