import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const safePath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const incomingHeaders = await headers();
  const url = new URL(request.url);
  const method = request.method;
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}/typing/${safePath}${url.search}`, {
      method,
      headers: {
        "Content-Type": request.headers.get("content-type") ?? "application/json",
        Cookie: incomingHeaders.get("cookie") ?? ""
      },
      body: method === "GET" || method === "HEAD" ? undefined : await request.text(),
      cache: "no-store"
    });
  } catch {
    return Response.json(
      { code: 50301, message: "打字记词服务暂不可用", data: null },
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

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
