import { proxyLearningFlashcardsApi } from "../_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return proxyLearningFlashcardsApi(request, "/public/textbooks", "GET", "电子教材列表服务暂不可用");
}
