export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const suffix = path.map(encodeURIComponent).join("/");
  try {
    const response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3602/api"}/picture-book-guide${suffix ? `/${suffix}` : ""}${new URL(request.url).search}`, {
      method: request.method, cache: "no-store",
      headers: { Cookie: request.headers.get("cookie") ?? "", "Content-Type": request.headers.get("content-type") ?? "application/json", ...(request.headers.has("range") ? { Range: request.headers.get("range")! } : {}) },
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer()
    });
    const headers = new Headers();
    for (const name of ["Content-Type", "Content-Length", "Content-Disposition", "Cache-Control", "Content-Range", "Accept-Ranges", "X-Content-Type-Options"]) {
      const value = response.headers.get(name); if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch { return Response.json({ code: 50301, message: "绘本导读服务暂不可用，请稍后重试", data: null }, { status: 503 }); }
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
