import { resolveAutomaticVoiceModel, type VoicePickerOption } from "./voice-picker";

export type DialogueInput = {
  projectId?: string;
  revision?: number;
  segmentId?: string;
  speakers: { id: string; name: string; voiceValue: string }[];
  segments: { id: string; speakerId: string; text: string; speed: number; pauseSeconds: number }[];
  format: "mp3" | "wav" | "opus";
  sampleRate: 16000 | 24000 | 48000;
  billingContext: "PERSONAL" | "ORGANIZATION";
  organizationId?: string;
};

export type DialogueQuote = {
  id: string;
  projectId: string;
  revision: number;
  expiresAt: string;
  totalCredits: number;
  segments: {
    id: string;
    speakerId: string;
    speakerName: string;
    voiceName: string;
    modelName: string;
    billingCharacters: number;
    credits: number;
    reused: boolean;
  }[];
};

export type DialogueProject = Omit<DialogueInput, "segments"> & {
  id: string;
  title: string;
  revision: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  actualCredits: number;
  audioUrl: string | null;
  outputRevision: number | null;
  errorMessage: string | null;
  generationId: string | null;
  segments: (DialogueInput["segments"][number] & {
    status: string;
    audioUrl: string | null;
    errorMessage: string | null;
  })[];
};

export type DialogueDraft = Omit<DialogueInput, "segmentId"> & { sourceText: string };
type DialogueModel = { aliasKey: string; isConfigured: boolean; modelName: string | null };
export const dialogueLimits = { speakers: 20, segments: 100, characters: 8000 };
export const dialogueDraftKey = (scope: string) => `xueleai:experience-voice:dialogue-draft:${scope}`;

export function createDialogueDraft(): DialogueDraft {
  return { sourceText: "", speakers: [], segments: [], format: "wav", sampleRate: 24000, billingContext: "PERSONAL" };
}

export function readyDialogueVoices<T extends { value: string }>(voices: T[]): T[] {
  return voices.filter((voice) => /^(system|voice):[^\s]{1,250}$/.test(voice.value));
}

type DialogueRolePrefix = { name: string; text: string };

function labelledRolePrefix(line: string): DialogueRolePrefix | null {
  const labelled = line.match(/^\s*([^:：\n]{1,40})[:：]\s*(.*)$/);
  if (!labelled) return null;
  const name = labelled[1].trim();
  if (!name || /[:：/]/.test(name) || /^\d+$/.test(name)) return null;
  return { name, text: labelled[2] };
}

function isExplicitRoleName(name: string) {
  return (
    /^(?:(?:Student|Speaker|Teacher|Narrator|Host|Doctor|Patient)(?:\s+[A-Za-z0-9]{1,8})?|[A-Z]|Alice|Bob|Tom|Mary|Jack|Lucy)$/i.test(
      name
    ) ||
    /^(?:学生|同学|老师|教师|旁白|角色|主持人|医生|患者|爸爸|妈妈|小明|小红)[\p{Script=Han}A-Za-z0-9]{0,6}$/u.test(
      name
    )
  );
}

function isEnglishNameLabel(name: string) {
  return /^(?:[A-Z][A-Za-z'’.-]{0,30})(?:\s+[A-Z][A-Za-z'’.-]{0,30}){0,3}$/.test(name);
}

function isRepeatableRoleLabel(name: string) {
  return isEnglishNameLabel(name) || /^[\p{Script=Han}]{1,12}$/u.test(name);
}

function inferRoleNames(lines: string[]) {
  const counts = new Map<string, number>();
  const englishNames = new Set<string>();
  for (const line of lines) {
    const prefix = labelledRolePrefix(line);
    if (!prefix || !isRepeatableRoleLabel(prefix.name)) continue;
    counts.set(prefix.name, (counts.get(prefix.name) ?? 0) + 1);
    if (isEnglishNameLabel(prefix.name)) englishNames.add(prefix.name);
  }
  return new Set(
    [...counts]
      .filter(([name, count]) => count >= 2 || (englishNames.size >= 2 && isEnglishNameLabel(name)))
      .map(([name]) => name)
  );
}

function rolePrefix(line: string, inferredNames: Set<string>): DialogueRolePrefix | null {
  const bracketed = line.match(
    /^\s*(?:\[([^\]\n]{1,40})\]|【([^】\n]{1,40})】|\(([^)\n]{1,40})\)|（([^）\n]{1,40})）)\s*[:：]?\s*(.*)$/
  );
  if (bracketed) {
    const name = bracketed.slice(1, 5).find(Boolean)!.trim();
    if (!name || /[:：/]/.test(name) || /^\d+$/.test(name)) return null;
    return { name, text: bracketed[5] };
  }
  const labelled = labelledRolePrefix(line);
  return labelled && (isExplicitRoleName(labelled.name) || inferredNames.has(labelled.name)) ? labelled : null;
}

export function parseVoiceDialogue(source: string, previous?: Pick<DialogueInput, "speakers" | "segments">) {
  const speakers: DialogueInput["speakers"] = [];
  const segments: DialogueInput["segments"] = [];
  const usedIds = new Set(previous?.speakers.map((speaker) => speaker.id));
  const usedSegmentIds = new Set(previous?.segments.map((segment) => segment.id));
  function role(name: string) {
    const current = speakers.find((speaker) => speaker.name === name);
    if (current) return current.id;
    const old = previous?.speakers.find((speaker) => speaker.name === name);
    let index = 1;
    while (usedIds.has(`speaker-${index}`)) index++;
    const speaker = old ? { ...old } : { id: `speaker-${index}`, name, voiceValue: "" };
    usedIds.add(speaker.id);
    speakers.push(speaker);
    return speaker.id;
  }
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const inferredNames = inferRoleNames(lines);
  for (const line of lines) {
    if (!line.trim()) continue;
    const prefix = rolePrefix(line, inferredNames);
    if (prefix || segments.length === 0) {
      const speakerId = prefix ? role(prefix.name) : "";
      const text = prefix?.text ?? line;
      const index = segments.length;
      const old = previous?.segments[index];
      let next = 1;
      while (usedSegmentIds.has(`segment-${next}`)) next++;
      const id = old?.id ?? `segment-${next}`;
      usedSegmentIds.add(id);
      segments.push({ id, speakerId, text, speed: old?.speed ?? 1, pauseSeconds: old?.pauseSeconds ?? 1 });
    } else {
      segments[segments.length - 1].text += `\n${line}`;
    }
  }
  return { speakers, segments };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function restoreDialogueDraft(
  raw: string | null,
  voices: { value: string }[],
  context?: { projectId?: string; allowUnbound?: boolean }
): DialogueDraft {
  const empty = createDialogueDraft();
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (
      !record(value) ||
      !Array.isArray(value.speakers) ||
      !Array.isArray(value.segments) ||
      value.speakers.length > dialogueLimits.speakers ||
      value.segments.length > dialogueLimits.segments
    )
      return empty;
    const allowedVoices = new Set(readyDialogueVoices(voices).map((voice) => voice.value));
    const speakers: DialogueInput["speakers"] = [];
    const segments: DialogueInput["segments"] = [];
    for (const speaker of value.speakers) {
      if (
        !record(speaker) ||
        typeof speaker.id !== "string" ||
        !/^[\w-]{1,100}$/.test(speaker.id) ||
        typeof speaker.name !== "string" ||
        !speaker.name.trim() ||
        speaker.name.length > 80 ||
        speakers.some((item) => item.id === speaker.id)
      )
        return empty;
      speakers.push({
        id: speaker.id,
        name: speaker.name,
        voiceValue:
          typeof speaker.voiceValue === "string" && allowedVoices.has(speaker.voiceValue) ? speaker.voiceValue : ""
      });
    }
    for (const segment of value.segments) {
      if (
        !record(segment) ||
        typeof segment.id !== "string" ||
        !/^[\w-]{1,100}$/.test(segment.id) ||
        typeof segment.text !== "string" ||
        segments.some((item) => item.id === segment.id)
      )
        return empty;
      segments.push({
        id: segment.id,
        text: segment.text.slice(0, 20000),
        speakerId: speakers.some((speaker) => speaker.id === segment.speakerId) ? String(segment.speakerId) : "",
        speed: typeof segment.speed === "number" && Number.isFinite(segment.speed) ? segment.speed : 1,
        pauseSeconds:
          typeof segment.pauseSeconds === "number" && Number.isFinite(segment.pauseSeconds) ? segment.pauseSeconds : 1
      });
    }
    const restored: DialogueDraft = {
      ...empty,
      speakers,
      segments,
      sourceText: typeof value.sourceText === "string" ? value.sourceText.slice(0, 20000) : "",
      format: value.format === "wav" || value.format === "opus" ? value.format : "mp3",
      sampleRate: value.sampleRate === 16000 || value.sampleRate === 48000 ? value.sampleRate : 24000,
      billingContext: value.billingContext === "ORGANIZATION" ? "ORGANIZATION" : "PERSONAL",
      ...(value.billingContext === "ORGANIZATION" && typeof value.organizationId === "string"
        ? { organizationId: value.organizationId.slice(0, 100) }
        : {}),
      ...(typeof value.projectId === "string" &&
      /^[\w-]{1,100}$/.test(value.projectId) &&
      Number.isInteger(value.revision) &&
      Number(value.revision) >= 0
        ? { projectId: value.projectId, revision: Number(value.revision) }
        : {})
    };
    if (context?.projectId) {
      return restored.projectId === context.projectId ? restored : empty;
    }
    if (context && (!context.allowUnbound || restored.projectId)) {
      return empty;
    }
    return restored;
  } catch {
    return empty;
  }
}

export function buildDialogueInput(
  draft: Omit<DialogueDraft, "sourceText">,
  target: Pick<DialogueInput, "projectId" | "revision" | "segmentId"> = {},
  accountOrganizationId?: string
): DialogueInput {
  if (target.segmentId && !draft.segments.some((segment) => segment.id === target.segmentId))
    throw new Error("请选择有效段落");
  const billingContext = accountOrganizationId === undefined ? draft.billingContext : accountOrganizationId ? "ORGANIZATION" : "PERSONAL";
  const organizationId = accountOrganizationId ?? draft.organizationId;
  return {
    ...(draft.projectId ? { projectId: draft.projectId, revision: draft.revision } : {}),
    ...target,
    speakers: draft.speakers.map(({ id, name, voiceValue }) => ({ id, name, voiceValue })),
    segments: draft.segments.map(({ id, speakerId, text, speed, pauseSeconds }) => ({
      id,
      speakerId,
      text,
      speed,
      pauseSeconds
    })),
    format: draft.format,
    sampleRate: draft.sampleRate,
    billingContext,
    ...(billingContext === "ORGANIZATION" && organizationId ? { organizationId } : {})
  };
}

export function dialogueSpeedBounds(modelName: string | null | undefined) {
  return modelName?.startsWith("eleven_") ? { min: 0.7, max: 1.2 } : { min: 0.5, max: 2 };
}

export function validateDialogueInput(
  input: DialogueInput,
  voices: VoicePickerOption[],
  models: DialogueModel[]
): string | null {
  if (!input.segments.length) return "请先输入或识别对话正文";
  if (input.speakers.length > 20) return "最多添加 20 个角色";
  if (input.segments.length > 100) return "最多添加 100 个段落";
  if (input.segments.reduce((sum, segment) => sum + segment.text.length, 0) > 8000) return "正文合计不能超过 8000 字符";
  if (input.billingContext === "ORGANIZATION" && !input.organizationId) return "请选择扣费空间";
  const ready = readyDialogueVoices(voices);
  if (
    new Set(input.speakers.map((speaker) => speaker.id)).size !== input.speakers.length ||
    new Set(input.segments.map((segment) => segment.id)).size !== input.segments.length ||
    [...input.speakers, ...input.segments].some((item) => !/^[\w-]{1,100}$/.test(item.id))
  )
    return "角色或段落标识无效，请重新识别";
  for (const speaker of input.speakers) {
    if (!speaker.name.trim() || speaker.name.length > 80) return "角色名称须为 1-80 个字符";
    if (!ready.some((voice) => voice.value === speaker.voiceValue)) return `请为${speaker.name}选择已就绪的可用音色`;
  }
  for (const [index, segment] of input.segments.entries()) {
    const speaker = input.speakers.find((item) => item.id === segment.speakerId);
    if (!speaker) return `请为第 ${index + 1} 段选择角色`;
    const voice = readyDialogueVoices(voices).find((item) => item.value === speaker.voiceValue);
    if (!voice) return `请为${speaker.name}选择已就绪的可用音色`;
    if (!segment.text.trim()) return `第 ${index + 1} 段正文不能为空`;
    if (
      !Number.isFinite(segment.pauseSeconds) ||
      segment.pauseSeconds < 0 ||
      segment.pauseSeconds > 5 ||
      Math.abs(segment.pauseSeconds * 10 - Math.round(segment.pauseSeconds * 10)) > 1e-8
    )
      return `第 ${index + 1} 段停顿须为 0–5 秒，精度为 0.1 秒`;
    // Only the requested sentence incurs synthesis; unrelated unavailable models do not block its retry.
    if (input.segmentId && segment.id !== input.segmentId) continue;
    const model = resolveAutomaticVoiceModel(models, voice);
    if (!model?.isConfigured) return `${speaker.name}的音色暂无兼容模型，请选择其他音色`;
    const bounds = dialogueSpeedBounds(model.modelName);
    if (!Number.isFinite(segment.speed) || segment.speed < bounds.min || segment.speed > bounds.max)
      return `第 ${index + 1} 段语速须为 ${bounds.min}–${bounds.max} 倍`;
    const limit = model.modelName === "eleven_v3" ? 5000 : 8000;
    if (segment.text.length > limit) return `第 ${index + 1} 段单次不能超过 ${limit} 字符`;
  }
  return null;
}

export function dialogueInputKey(input: DialogueInput) {
  return JSON.stringify(buildDialogueInput(input, input.segmentId ? { segmentId: input.segmentId } : {}));
}

export function applyDialogueQuoteMetadata(draft: DialogueDraft, quote: DialogueQuote): DialogueDraft {
  return { ...draft, projectId: quote.projectId, revision: quote.revision };
}

export function quoteIsCurrent(quote: DialogueQuote, quotedKey: string, input: DialogueInput, now = Date.now()) {
  return Date.parse(quote.expiresAt) > now && quotedKey === dialogueInputKey(input);
}

export function dialogueSegmentAudio(project: DialogueProject | null, draft: DialogueDraft, id: string): string | null {
  if (draft.projectId && draft.projectId !== project?.id) return null;
  const saved = project?.segments.find((segment) => segment.id === id);
  const current = draft.segments.find((segment) => segment.id === id);
  if (
    !saved?.audioUrl ||
    saved.status !== "SUCCEEDED" ||
    !current ||
    saved.text !== current.text ||
    saved.speed !== current.speed
  )
    return null;
  const savedVoice = project?.speakers.find((speaker) => speaker.id === saved.speakerId)?.voiceValue;
  const currentVoice = draft.speakers.find((speaker) => speaker.id === current.speakerId)?.voiceValue;
  return savedVoice && savedVoice === currentVoice ? saved.audioUrl : null;
}

export function dialogueOutputIsCurrent(project: DialogueProject | null, draft: DialogueDraft) {
  return Boolean(
    project?.audioUrl &&
      project.status === "SUCCEEDED" &&
      project.outputRevision === project.revision &&
      project.format === draft.format &&
      project.sampleRate === draft.sampleRate &&
      project.segments.length === draft.segments.length &&
      draft.segments.every(
        (segment, index) =>
          project.segments[index].id === segment.id &&
          project.segments[index].pauseSeconds === segment.pauseSeconds &&
          dialogueSegmentAudio(project, draft, segment.id)
      )
  );
}

export function dialoguePlayback(project: DialogueProject | null, draft: DialogueDraft) {
  if (!project?.audioUrl || project.outputRevision === null) return null;
  return { url: project.audioUrl, revision: project.outputRevision, current: dialogueOutputIsCurrent(project, draft) };
}

export function isDialogueBusy(status: string | undefined) {
  return ["QUEUED", "PROCESSING", "MERGING"].includes(status ?? "");
}

export function dialogueStatusName(status: string | undefined) {
  const labels: Record<string, string> = {
    DRAFT: "未生成",
    QUEUED: "待处理",
    PENDING: "待生成",
    REUSED: "已复用",
    SKIPPED: "未生成",
    PROCESSING: "合成中",
    STORING: "保存中",
    MERGING: "合并中",
    SUCCEEDED: "已完成",
    PARTIAL_FAILED: "部分失败",
    FAILED: "失败"
  };
  return labels[status ?? ""] ?? "未生成";
}

export function dialogueFriendlyError(message: unknown, fallback = "语音服务暂时不可用，请稍后重试") {
  return typeof message === "string" &&
    /[\u4e00-\u9fff]/.test(message) &&
    !/prisma|sql|jwt|stack|exception|trace|https?:\/\//i.test(message)
    ? message.slice(0, 240)
    : fallback;
}

export type DialogueOperation = "projects" | "project" | "quote" | "generate" | "merge";
export function dialogueOperationPath(operation: string, method: string, projectId?: string | null): string | null {
  if (method === "GET" && operation === "projects") return "/audio/dialogue/projects";
  if (method === "POST" && operation === "quote") return "/audio/dialogue/quotes";
  if (method === "POST" && operation === "generate") return "/audio/dialogue/generations";
  if (!projectId || !/^[\w-]{1,100}$/.test(projectId)) return null;
  if (method === "GET" && operation === "project") return `/audio/dialogue/projects/${projectId}`;
  if (method === "POST" && operation === "merge") return `/audio/dialogue/projects/${projectId}/merge`;
  return null;
}

export async function requestVoiceDialogue<T>(
  operation: DialogueOperation,
  options: { projectId?: string; body?: DialogueInput | { quoteId: string }; signal?: AbortSignal } = {}
): Promise<T> {
  const query = new URLSearchParams({ operation });
  if (options.projectId) query.set("projectId", options.projectId);
  let response: Response;
  try {
    response = await fetch(`/voice/api?${query}`, {
      method: operation === "projects" || operation === "project" ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: options.signal
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error("语音服务暂时无法连接，请稍后重试", { cause: error });
  }
  const payload = (await response.json().catch(() => null)) as { code: number; message: string; data: T | null } | null;
  if (!response.ok || payload?.code !== 0 || payload.data === null || payload.data === undefined)
    throw new Error(dialogueFriendlyError(payload?.message));
  return payload.data;
}
