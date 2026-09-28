import { headers } from "next/headers";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function proxyLearningFlashcardsApi(
  request: Request,
  path: string,
  method: "GET" | "PATCH" | "POST",
  unavailableMessage = "AI 学习闪卡服务暂不可用"
) {
  const requestHeaders = await headers();
  const url = new URL(request.url);
  const query = method === "GET" ? url.search : "";
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}${query}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: requestHeaders.get("cookie") ?? ""
      },
      body: method === "GET" ? undefined : await request.text(),
      cache: "no-store"
    });
  } catch {
    return Response.json(
      {
        code: 50301,
        message: unavailableMessage,
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
