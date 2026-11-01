export type GuidePage = {
  pageNumber: number; sourceText: string; script: string; imageUrl: string;
  pdfNeedsAnalysis?: boolean; bookSummary?: string; pdfAnalysis?: { kind: "COVER" | "CONTENT" | "ADVERTISEMENT"; description: string; text: string }; pdfOverviewCache?: { selection: number[]; levels: Array<Array<{ title: string; summary: string } | null>> };
  audioUrl: string | null; audioTaskId: string | null; audioMimeType: string | null; audioVoice: string | null; audioSpeed: number | null;
};
export type GuideSummary = {
  id: string; title: string; pdfName: string; pdfUrl: string | null; audience: string; style: string;
  version: number; busy: boolean; pageCount: number; scriptCount: number; audioCount: number; updatedAt: string;
};
export type PictureBookGuide = GuideSummary & { pages: GuidePage[] };
export type GuideOptions = { audiences: string[]; styles: Array<{ value: string; label: string; description: string; speed: number }> };
export type GuideBookChoice = { bookId: string; title: string; pageCount: number; scope: "MINE" | "PUBLIC"; completed: boolean; revisionItemId?: string };
export type GuideBookListing = { items: GuideBookChoice[]; total: number; page: number; pageSize: number };

export function guidePlaybackPage(page: GuidePage, index: number, hasCover = false) {
  const cover = hasCover && index === 0;
  return { cover, text: page.sourceText.trim() ? page.sourceText : page.pdfAnalysis?.text ?? "", label: cover ? "封面" : `第 ${index + 1 - Number(hasCover)} 页` };
}

export async function guideRequest<T>(path = "", method = "GET", data?: unknown): Promise<T> {
  const isForm = data instanceof FormData;
  const response = await fetch(`/api/picture-book-guide${path}`, { method, credentials: "include", cache: "no-store",
    headers: data !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: data === undefined ? undefined : isForm ? data : JSON.stringify(data) });
  const payload = await response.json().catch(() => null) as { code?: number; message?: string; data?: T } | null;
  if (!response.ok || payload?.code !== 0 || payload.data === undefined) throw new Error(payload?.message || "绘本导读请求失败，请稍后重试");
  return payload.data;
}

export function guideAudioSelection(value: string, speed: number) {
  if (value.startsWith("voice:")) return { voiceAssetId: value.slice(6), speed };
  if (value.startsWith("system:")) return { voice: value.slice(7), speed };
  return { speed };
}

export function guideAudioExtension(mimeType: string | null) {
  return ({ "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/aac": "aac" } as Record<string, string>)[mimeType ?? ""] ?? "mp3";
}

export function defaultGuideVoice(library: {
  defaultVoice: { voiceAssetId: string | null; systemVoiceId: string | null };
  systemVoices: Array<{ id: string; providerVoiceId: string | null; status: string; isDefault?: boolean }>;
  platformVoices: Array<{ id: string; status: string; isDefault?: boolean }>;
  customVoices: Array<{ id: string; status: string; isDefault?: boolean }>;
}) {
  const assets = [...library.platformVoices, ...library.customVoices].filter(item => item.status === "READY");
  const asset = assets.find(item => item.id === library.defaultVoice.voiceAssetId || item.isDefault);
  if (asset) return `voice:${asset.id}`;
  const systems = library.systemVoices.filter(item => item.status === "READY" && item.providerVoiceId);
  const system = systems.find(item => item.id === library.defaultVoice.systemVoiceId || item.providerVoiceId === library.defaultVoice.systemVoiceId || item.isDefault) ?? systems[0];
  return system ? `system:${system.providerVoiceId}` : assets[0] ? `voice:${assets[0].id}` : "";
}
