import { proxyLearningFlashcardsApi } from "../../../_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  return proxyLearningFlashcardsApi(request, `/learning-flashcards/cards/${encodeURIComponent(id)}/review`, "POST");
}
