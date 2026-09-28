import { proxyLearningFlashcardsApi } from "../../_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return proxyLearningFlashcardsApi(request, "/learning-flashcards/decks/generate", "POST");
}
