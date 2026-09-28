import { proxyLearningFlashcardsApi } from "../_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return proxyLearningFlashcardsApi(request, "/learning-flashcards/decks", "GET");
}
