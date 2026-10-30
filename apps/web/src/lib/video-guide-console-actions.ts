export function subtitleDownloadFilename(name: string, extension: ".srt" | ".ass"): string {
  const safeName = name.replace(/[\\/:*?"<>|]/g, "-").trim() || "subtitle";
  return safeName.toLowerCase().endsWith(extension) ? safeName : `${safeName}${extension}`;
}

export function resolveSubtitleWorkflowSource(input: {
  generationActive: boolean;
  generationProgress: number;
  hasSubtitle: boolean;
}) {
  if (input.generationActive || input.generationProgress > 0) {
    return "generated" as const;
  }

  return input.hasSubtitle ? ("uploaded" as const) : null;
}

export function resolveOperationUiProgress(
  operation?: { percent: number; status: string } | null
) {
  return {
    isGenerating: operation?.status === "QUEUED" || operation?.status === "RUNNING",
    progress: operation?.percent ?? 0
  };
}

export function resolveVideoGuideWorkflowLesson<T>(input: {
  activeLesson?: T;
  fallbackLesson?: T;
  watchedLesson?: T;
  workingLesson?: T;
}) {
  return (
    input.workingLesson ??
    input.activeLesson ??
    input.watchedLesson ??
    input.fallbackLesson
  );
}

export async function resolveSubtitleDownloadText(
  serverUrl: string | null | undefined,
  fallbackText: string,
  fetchText: (url: string) => Promise<string>
): Promise<string | null> {
  if (serverUrl) {
    try {
      const serverText = await fetchText(serverUrl);
      if (serverText.trim()) return serverText;
    } catch {
      // Keep the loaded editor text available when the remote subtitle is unavailable.
    }
  }

  return fallbackText.trim() ? fallbackText : null;
}

export function downloadSubtitleText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function estimateMediaConversionRemainingMinutes(
  startedAtMs: number,
  percent: number,
  nowMs: number
): number | null {
  if (
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(percent) ||
    percent < 5 ||
    percent >= 100 ||
    nowMs <= startedAtMs
  ) {
    return null;
  }

  const elapsedMs = nowMs - startedAtMs;
  const remainingMs = elapsedMs * ((100 - percent) / percent);

  return Math.max(1, Math.ceil(remainingMs / 60_000));
}

interface VideoGuideVoiceItem {
  accent?: string | null;
  ageCategory?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  id?: string;
  language?: string | null;
  languages?: string[];
  gender?: string | null;
  name: string;
  previewAudioUrl?: string | null;
  providerVoiceId?: string | null;
  status?: string;
  targetModel?: string;
  type?: string;
  typeName?: string;
  visibility?: "PRIVATE" | "PUBLIC" | "ADMIN_ONLY";
}

export function buildVideoGuideVoiceOptions(library: {
  customVoices?: VideoGuideVoiceItem[];
  defaultVoice?: { systemVoiceId?: string | null; voiceAssetId?: string | null };
  platformVoices?: VideoGuideVoiceItem[];
  systemVoices?: VideoGuideVoiceItem[];
}) {
  const defaultAssetId = library.defaultVoice?.voiceAssetId;
  const defaultSystemId = library.defaultVoice?.systemVoiceId;
  const customOptions = (library.customVoices ?? [])
    .filter((voice) => voice.status === "READY" && Boolean(voice.id && voice.providerVoiceId))
    .map((voice) => ({
      ...voice,
      value: `voice:${voice.id}`,
      badge: voice.typeName || "我的音色",
      supportedModels: voice.targetModel ? [voice.targetModel] : [],
      isDefault: voice.id === defaultAssetId
    }));
  const platformOptions = (library.platformVoices ?? [])
    .filter((voice) => voice.status === "READY" && Boolean(voice.id && voice.providerVoiceId))
    .map((voice) => ({
      ...voice,
      value: `voice:${voice.id}`,
      badge: voice.type === "CLONED" ? "平台复刻音色" : "平台设计音色",
      supportedModels: voice.targetModel ? [voice.targetModel] : [],
      isDefault: voice.id === defaultAssetId
    }));
  const systemOptions = (library.systemVoices ?? [])
    .filter((voice) => (!voice.status || voice.status === "READY") && Boolean(voice.providerVoiceId))
    .map((voice) => ({
      ...voice,
      value: voice.providerVoiceId!,
      isSystemVoice: true,
      badge: "官方多语种音色",
      isDefault: voice.providerVoiceId === defaultSystemId
    }));

  return [...customOptions, ...platformOptions, ...systemOptions].sort(
    (left, right) => Number(right.isDefault) - Number(left.isDefault)
  );
}

export function resolveVideoGuideVoiceSelection(input: {
  currentVoice?: string | null;
  fallbackVoice?: string | null;
  preferredVoice?: string | null;
  voices: Array<{ isDefault?: boolean; value: string }>;
}): string {
  const availableValues = new Set(input.voices.map((voice) => voice.value));

  for (const candidate of [input.preferredVoice, input.currentVoice]) {
    if (candidate && availableValues.has(candidate)) {
      return candidate;
    }
  }

  return (
    input.voices.find((voice) => voice.isDefault)?.value ??
    (input.fallbackVoice && availableValues.has(input.fallbackVoice)
      ? input.fallbackVoice
      : null) ??
    input.voices[0]?.value ??
    ""
  );
}
