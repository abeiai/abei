import { proxyCourseAudioDownload } from "@/lib/english-guided-study-download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await context.params;
  return proxyCourseAudioDownload(request, id, kind, { apiBase: process.env.API_BASE_URL ?? "http://localhost:3322/api" });
}
