import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function proxy(request: Request) {
  const requestHeaders = await headers();
  const scene = new URL(request.url).searchParams.get("scene");
  const query = scene ? `?scene=${encodeURIComponent(scene)}` : "";
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}/english-guided-study/materials${query}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: requestHeaders.get("cookie") ?? ""
      },
      cache: "no-store"
    });
  } catch {
    return Response.json(
      {
        code: 50301,
        message: "英文带学历史服务暂不可用",
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

export function GET(request: Request) {
  return proxy(request);
}
