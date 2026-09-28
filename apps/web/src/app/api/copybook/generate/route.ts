import { headers } from "next/headers";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function POST(request: Request) {
  const requestHeaders = await headers();
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}/copybooks/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: requestHeaders.get("cookie") ?? ""
      },
      body: await request.text(),
      cache: "no-store"
    });
  } catch {
    return Response.json(
      {
        code: 50301,
        message: "字帖生成服务暂不可用",
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
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
