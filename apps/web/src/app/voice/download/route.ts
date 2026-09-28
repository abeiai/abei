import { proxyVoiceDownload } from "@/lib/voice-download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyVoiceDownload(request, { apiBase: process.env.API_BASE_URL ?? "http://localhost:3322/api" });
}
