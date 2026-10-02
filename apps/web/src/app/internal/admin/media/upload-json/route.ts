import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

function isUploadedFile(value: FormDataEntryValue | null | undefined): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.size === "number" &&
    value.size > 0 &&
    typeof value.arrayBuffer === "function"
  );
}

async function getCookieHeader() {
  const cookieStore = await cookies();

  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type");

  if (!contentType?.includes("multipart/form-data")) {
    return Response.json(
      {
        code: 40001,
        message: "请选择要上传的图片",
        data: null
      },
      { status: 400 }
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!isUploadedFile(file)) {
    return Response.json(
      {
        code: 40001,
        message: "请选择要上传的图片",
        data: null
      },
      { status: 400 }
    );
  }

  const apiFormData = new FormData();
  apiFormData.set("file", file);

  const sourceType = formData?.get("sourceType");
  if (formData?.get("purpose") === "PICTURE_BOOK_STYLE") apiFormData.set("purpose", "PICTURE_BOOK_STYLE");

  if (typeof sourceType === "string") {
    apiFormData.set("sourceType", sourceType);
  }

  const response = await fetch(`${getApiBaseUrl()}/media/admin/upload`, {
    body: apiFormData,
    cache: "no-store",
    headers: {
      Cookie: await getCookieHeader()
    },
    method: "POST"
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}
