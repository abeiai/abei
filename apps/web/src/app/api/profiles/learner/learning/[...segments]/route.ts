import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedPaths = [
  /^sessions$/u,
  /^sessions\/[^/]+\/heartbeat$/u,
  /^sessions\/[^/]+\/events$/u,
  /^sessions\/[^/]+\/end$/u
];

function apiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ segments: string[] }> }
) {
  const { segments } = await context.params;
  const path = segments.join("/");
  if (!allowedPaths.some((pattern) => pattern.test(path))) {
    return Response.json(
      { code: 40401, message: "学习记录接口不存在", data: null },
      { status: 404 }
    );
  }

  const requestHeaders = await headers();
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/profiles/learner/learning/${segments.map(encodeURIComponent).join("/")}`,
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
      { code: 50301, message: "学习记录同步失败，请稍后重试", data: null },
      { status: 503 }
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return Response.json(
      { code: 50301, message: "学习记录同步失败，请稍后重试", data: null },
      { status: 503 }
    );
  }
  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    data?: unknown;
  };
  if (response.status >= 500) {
    return Response.json(
      { code: 50301, message: "学习记录同步失败，请稍后重试", data: null },
      { status: 503 }
    );
  }
  return Response.json(
    {
      code: typeof payload.code === "number" ? payload.code : 50001,
      message: typeof payload.message === "string" ? payload.message : "学习记录同步失败，请稍后重试",
      data: payload.data ?? null
    },
    { status: response.status }
  );
}
