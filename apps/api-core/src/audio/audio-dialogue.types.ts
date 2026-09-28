import { createHash } from "node:crypto";
import { AppException } from "../common/app-exception.js";

export interface DialogueSpeaker { id: string; name: string; voiceValue: string }
export interface DialogueSegment { id: string; speakerId: string; text: string; speed: number; pauseSeconds: number }
export interface DialogueInput {
  projectId?: string;
  revision?: number;
  segmentId?: string;
  speakers: DialogueSpeaker[];
  segments: DialogueSegment[];
  format: "mp3" | "wav" | "opus";
  sampleRate: number;
  billingContext: "PERSONAL" | "ORGANIZATION";
  organizationId?: string;
}
export interface PreparedDialogueTts {
  modelInstanceId: string;
  providerInstanceId: string;
  providerKey: string;
  modelName: string;
  providerVoiceId: string;
  voiceAssetId: string | null;
  voiceName: string;
  billingCharacters: number;
  credits: number;
  speed: number;
  pricingFingerprint: string;
}
export interface DialoguePlan extends PreparedDialogueTts {
  id: string;
  speakerId: string;
  speakerName: string;
  fingerprint: string;
  reused: boolean;
  status: "PENDING" | "REUSED" | "SKIPPED" | "PROCESSING" | "STORING" | "SUCCEEDED" | "FAILED";
  audioTaskId?: string;
  errorMessage?: string;
}
export interface DialogueClip {
  fingerprint: string;
  audioAssetId: string;
  audioTaskId: string;
  url: string;
  credits: number;
}
export type DialogueClips = Record<string, DialogueClip>;

function invalid(message: string): never { throw new AppException(40001, message, 400); }
function boundedId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) invalid("角色或段落标识无效");
  return value;
}
export function validateDialogueInput(value: unknown): DialogueInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("多人配音参数无效");
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.speakers) || data.speakers.length < 1 || data.speakers.length > 20) invalid("请选择 1-20 个语音角色");
  if (!Array.isArray(data.segments) || data.segments.length < 1 || data.segments.length > 100) invalid("对话需要包含 1-100 段正文");
  const speakers = data.speakers.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") invalid("语音角色无效");
    const item = raw as Record<string, unknown>;
    const id = boundedId(item.id);
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name || name.length > 80) invalid("角色名称需要包含 1-80 个字符");
    const voiceValue = typeof item.voiceValue === "string" ? item.voiceValue : "";
    if (!/^(voice|system):[^\s]{1,250}$/.test(voiceValue)) invalid(`请为角色「${name}」选择已就绪的音色`);
    return { id, name, voiceValue };
  });
  if (new Set(speakers.map(s => s.id)).size !== speakers.length) invalid("角色标识不能重复");
  const segments = data.segments.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") invalid("对话段落无效");
    const item = raw as Record<string, unknown>;
    const id = boundedId(item.id);
    const speakerId = boundedId(item.speakerId);
    if (!speakers.some(s => s.id === speakerId)) invalid("请为每段对话分配语音角色");
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text || text.length > 8000) invalid("每段正文需要包含 1-8000 个字符");
    const speed = item.speed;
    if (typeof speed !== "number" || !Number.isFinite(speed) || speed < 0.5 || speed > 2) invalid("语速需要在模型支持范围内");
    const pauseSeconds = item.pauseSeconds;
    if (typeof pauseSeconds !== "number" || !Number.isFinite(pauseSeconds) || pauseSeconds < 0 || pauseSeconds > 5 || Math.abs(pauseSeconds * 10 - Math.round(pauseSeconds * 10)) > 0.00001) invalid("段尾停顿需要为 0-5 秒，精确到 0.1 秒");
    return { id, speakerId, text, speed, pauseSeconds };
  });
  if (new Set(segments.map(s => s.id)).size !== segments.length) invalid("段落标识不能重复");
  if (segments.reduce((sum, s) => sum + s.text.length, 0) > 8000) invalid("对话正文合计不能超过 8000 个字符");
  if (!["mp3", "wav", "opus"].includes(String(data.format))) invalid("音频格式无效");
  if (![16000, 24000, 48000].includes(Number(data.sampleRate))) invalid("音频采样率无效");
  if (!["PERSONAL", "ORGANIZATION"].includes(String(data.billingContext))) invalid("请选择有效的扣费空间");
  const organizationId = data.organizationId ? boundedId(data.organizationId) : undefined;
  if (data.billingContext === "ORGANIZATION" && !organizationId) invalid("请选择企业空间");
  if (data.billingContext === "PERSONAL" && organizationId) invalid("个人扣费不能指定企业空间");
  if (data.revision !== undefined && (!Number.isSafeInteger(data.revision) || Number(data.revision) < 1)) invalid("配音版本无效");
  const segmentId = data.segmentId ? boundedId(data.segmentId) : undefined;
  if (segmentId && !segments.some(s => s.id === segmentId)) invalid("要重新合成的段落不存在");
  return {
    ...(data.projectId ? { projectId: boundedId(data.projectId) } : {}),
    ...(data.revision !== undefined ? { revision: Number(data.revision) } : {}),
    ...(segmentId ? { segmentId } : {}), speakers, segments,
    format: data.format as DialogueInput["format"], sampleRate: Number(data.sampleRate),
    billingContext: data.billingContext as DialogueInput["billingContext"], ...(organizationId ? { organizationId } : {})
  };
}

export function dialogueFingerprint(value: unknown): string {
  const ordered = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(ordered);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, ordered(child)]));
    return item;
  };
  return createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
}
export function dialogueAudioFingerprint(segment: DialogueSegment, prepared: PreparedDialogueTts, format: "wav" | "mp3") {
  return dialogueFingerprint({ text: segment.text, model: prepared.modelInstanceId, provider: prepared.providerInstanceId, voice: prepared.providerVoiceId, voiceAssetId: prepared.voiceAssetId, speed: prepared.speed, sampleRate: 24000, format });
}
export async function buildDialoguePlans(
  input: DialogueInput, clips: DialogueClips,
  prepare: (context: unknown, segment: DialogueSegment, speaker: DialogueSpeaker) => Promise<PreparedDialogueTts>
): Promise<DialoguePlan[]> {
  const plans: DialoguePlan[] = [];
  for (const segment of input.segments) {
    const speaker = input.speakers.find(s => s.id === segment.speakerId)!;
    const prepared = await prepare(null, segment, speaker);
    if (!Number.isSafeInteger(prepared.credits) || prepared.credits < 0 || prepared.credits > 2_000_000_000) invalid("模型报价无效");
    let fingerprint = dialogueAudioFingerprint(segment, prepared, "wav");
    // Already paid MP3 clips remain reusable; an explicit regeneration creates a WAV master.
    const legacyFingerprint = dialogueAudioFingerprint(segment, prepared, "mp3");
    const stored = clips[segment.id]?.fingerprint;
    const reused = (stored === fingerprint || stored === legacyFingerprint) && input.segmentId !== segment.id;
    if (reused) fingerprint = stored;
    const skipped = Boolean(input.segmentId && input.segmentId !== segment.id && !reused);
    plans.push({ ...prepared, id: segment.id, speakerId: speaker.id, speakerName: speaker.name, fingerprint, reused, credits: reused || skipped ? 0 : prepared.credits, status: reused ? "REUSED" : skipped ? "SKIPPED" : "PENDING" });
  }
  if (!Number.isSafeInteger(plans.reduce((sum, p) => sum + p.credits, 0)) || plans.reduce((sum, p) => sum + p.credits, 0) > 2_000_000_000) invalid("合成总报价超出范围");
  return plans;
}
export function successfulDialogueCredits(plans: { credits: number; status: string }[]) {
  return plans.filter(p => p.status === "SUCCEEDED").reduce((sum, p) => sum + p.credits, 0);
}
export function assertDialogueQuoteCurrent(quote: { revision: number; expiresAt: Date; fingerprint: string }, revision: number, fingerprint: string, now = new Date()) {
  if (quote.expiresAt <= now) throw new AppException(40901, "费用确认已过期，请重新确认", 409);
  if (quote.revision !== revision || quote.fingerprint !== fingerprint) throw new AppException(40901, "正文、音色、模型或价格已变化，请重新确认费用", 409);
}

export function stripDialogueAudioCache(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const payload = value as Record<string, unknown>;
  if (!payload.dialogueProjectId) return value;
  const publicPayload = { ...payload };
  delete publicPayload.dialogueResult;
  delete publicPayload.dialogueCachedAt;
  return publicPayload;
}
