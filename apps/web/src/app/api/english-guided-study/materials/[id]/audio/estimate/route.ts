import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestHeaders = await headers();
  const { id } = await context.params;
  let response: Response;

  try {
    response = await fetch(
      `${getApiBaseUrl()}/english-guided-study/materials/${encodeURIComponent(id)}/audio/estimate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: requestHeaders.get("cookie") ?? ""
        },
        body: await request.text(),
        cache: "no-store"
      }
    );
  } catch {
    return Response.json(
      {
        code: 50301,
        message: "英文带学语音点数预估服务暂不可用",
        data: null
      },
      { status: 503 }
    );
  }

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}
