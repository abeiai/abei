function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let response: Response;

  try {
    response = await fetch(
      `${getApiBaseUrl()}/public/learning-flashcards/decks/${encodeURIComponent(id)}`,
      {
        headers: {
          "Content-Type": "application/json"
        },
        cache: "no-store"
      }
    );
  } catch {
    return Response.json(
      {
        code: 50301,
        message: "AI 学习闪卡服务暂不可用",
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
