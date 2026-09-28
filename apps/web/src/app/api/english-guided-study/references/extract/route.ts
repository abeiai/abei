import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function POST(request: Request) {
  const requestHeaders = await headers();
  const scene = new URL(request.url).searchParams.get("scene");
  const query = scene ? `?scene=${encodeURIComponent(scene)}` : "";
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}/english-guided-study/references/extract${query}`, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("content-type") ?? "multipart/form-data",
        Cookie: requestHeaders.get("cookie") ?? ""
      },
      body: await request.arrayBuffer(),
      cache: "no-store"
    });
  } catch {
    return Response.json(
      {
        code: 50301,
        message: "参考文档提取服务暂不可用",
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
