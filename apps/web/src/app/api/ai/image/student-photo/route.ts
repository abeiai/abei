import { headers } from "next/headers";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { signStudentPhotoDownload } from "@/lib/student-photo-download-token";

export async function POST(request: Request) {
  const requestHeaders = await headers();
  const body = await request.text();
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3322/api"}/ai/image/student-photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: requestHeaders.get("cookie") ?? "" },
    body,
    cache: "no-store"
  });
  const raw = await response.text();
  if (response.ok) {
    try {
      const [user, input] = await Promise.all([getOptionalCurrentUser(), Promise.resolve(JSON.parse(body) as { widthMm: number; heightMm: number })]);
      const payload = JSON.parse(raw) as { code: number; data?: { images?: Array<{ url: string }> } };
      if (user && payload.code === 0 && payload.data?.images) {
        payload.data.images = payload.data.images.map((image, index) => ({
          ...image,
          downloadToken: signStudentPhotoDownload({ userId: user.id, url: image.url, index: index + 1, widthMm: input.widthMm, heightMm: input.heightMm })
        }));
        return Response.json(payload, { status: response.status });
      }
    } catch { /* The generated images remain available even if a download link cannot be signed. */ }
  }
  return new Response(raw, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8" }
  });
}
