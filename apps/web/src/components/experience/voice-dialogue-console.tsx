"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ClipboardPaste,
  LoaderCircle,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  X
} from "lucide-react";

import { VoicePicker } from "@/components/audio/voice-picker";
import { VoiceDownloadButton } from "@/components/audio/voice-download-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { VoiceModelOption, VoiceOption } from "@/components/experience/voice-console";
import {
  applyDialogueQuoteMetadata,
  buildDialogueInput,
  createDialogueDraft,
  dialogueDraftKey,
  dialogueFriendlyError,
  dialogueInputKey,
  dialogueOutputIsCurrent,
  dialoguePlayback,
  dialogueSegmentAudio,
  dialogueSpeedBounds,
  dialogueStatusName,
  isDialogueBusy,
  parseVoiceDialogue,
  quoteIsCurrent,
  readyDialogueVoices,
  requestVoiceDialogue,
  restoreDialogueDraft,
  validateDialogueInput,
  type DialogueDraft,
  type DialogueProject,
  type DialogueQuote
} from "@/lib/voice-dialogue";
import { resolveAutomaticVoiceModel, resolveVoiceAvatar } from "@/lib/voice-picker";

interface Props {
  active: boolean;
  currentProject: DialogueProject | null;
  restoreUnboundDraft: boolean;
  loggedIn: boolean;
  draftScope: string;
  models: VoiceModelOption[];
  voices: VoiceOption[];
  initialOrganizationId: string;
  modeControl: ReactNode;
  onProjectChange: (project: DialogueProject) => void;
}

type QuotedDraft = { quote: DialogueQuote; key: string; segmentId?: string; mergeOnly: boolean };

export function VoiceDialogueConsole({
  active,
  currentProject,
  restoreUnboundDraft,
  loggedIn,
  draftScope,
  models,
  voices,
  initialOrganizationId,
  modeControl,
  onProjectChange
}: Props) {
  const readyVoices = useMemo(() => readyDialogueVoices(voices), [voices]);
  const [draft, setDraft] = useState<DialogueDraft>(() =>
    currentProject
      ? {
          ...createDialogueDraft(),
          ...buildDialogueInput(currentProject, { projectId: currentProject.id, revision: currentProject.revision }, initialOrganizationId)
        }
      : {
          ...createDialogueDraft(),
          billingContext: initialOrganizationId ? "ORGANIZATION" : "PERSONAL",
          ...(initialOrganizationId ? { organizationId: initialOrganizationId } : {})
        }
  );
  const [draftReady, setDraftReady] = useState(Boolean(currentProject));
  const [project, setProject] = useState(currentProject);
  const [selectedId, setSelectedId] = useState(currentProject?.segments[0]?.id ?? "");
  const [quoted, setQuoted] = useState<QuotedDraft | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState<"quote" | "confirm" | "merge" | null>(null);
  const [error, setError] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const draftRef = useRef(draft);
  const editVersion = useRef(0);
  const actionRequest = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const activeRef = useRef(active);
  const preview = useRef<HTMLAudioElement | null>(null);
  const completeAudio = useRef<HTMLAudioElement | null>(null);
  const feeDialog = useRef<HTMLDialogElement | null>(null);
  const sourceDialog = useRef<HTMLDialogElement | null>(null);
  const busy = isDialogueBusy(project?.status);
  const locked = busy || pending === "confirm" || pending === "merge";
  const selected = draft.segments.find((segment) => segment.id === selectedId) ?? draft.segments[0];
  const selectedSpeaker = draft.speakers.find((speaker) => speaker.id === selected?.speakerId);
  const selectedVoice = readyVoices.find((voice) => voice.value === selectedSpeaker?.voiceValue);
  const savedSelected = project?.segments.find((segment) => segment.id === selected?.id);
  const selectedModel = resolveAutomaticVoiceModel(models, selectedVoice);
  const speedBounds = dialogueSpeedBounds(selectedModel?.modelName);
  const currentOutput = dialogueOutputIsCurrent(project, draft);
  const playback = dialoguePlayback(project, draft);
  const allClipsReady =
    draft.segments.length > 0 && draft.segments.every((segment) => dialogueSegmentAudio(project, draft, segment.id));
  const completed = draft.segments.filter((segment) => dialogueSegmentAudio(project, draft, segment.id)).length;
  const selectedClipUrl = selected ? dialogueSegmentAudio(project, draft, selected.id) : null;
  const selectedMatchesSaved = Boolean(
    selected &&
      savedSelected &&
      savedSelected.text === selected.text &&
      savedSelected.speed === selected.speed &&
      project?.speakers.find((speaker) => speaker.id === savedSelected.speakerId)?.voiceValue ===
        selectedSpeaker?.voiceValue
  );
  const statusLabel =
    project?.status === "SUCCEEDED" && !currentOutput
      ? allClipsReady
        ? "待合并"
        : "待生成"
      : dialogueStatusName(project?.status);

  function stopPreview() {
    preview.current?.pause();
    preview.current = null;
    setPlayingId(null);
  }

  function edit(update: (value: DialogueDraft) => DialogueDraft) {
    if (locked) return;
    editVersion.current++;
    if (pending !== "quote") {
      actionRequest.current?.abort();
      actionRequest.current = null;
      setPending(null);
    }
    setQuoted(null);
    setError("");
    stopPreview();
    const next = update(draftRef.current);
    draftRef.current = next;
    setDraft(next);
  }

  function adopt(value: DialogueProject) {
    setProject(value);
    onProjectChange(value);
    const next = {
      ...draftRef.current,
      ...buildDialogueInput(value, { projectId: value.id, revision: value.revision }, initialOrganizationId)
    };
    draftRef.current = next;
    setDraft(next);
    setSelectedId((id) => (value.segments.some((segment) => segment.id === id) ? id : (value.segments[0]?.id ?? "")));
  }

  useEffect(() => {
    editVersion.current++;
    actionRequest.current?.abort();
    actionRequest.current = null;
    setPending(null);
    setQuoted(null);
    setError("");
    let restored: DialogueDraft | null = null;
    try {
      const raw = window.localStorage.getItem(dialogueDraftKey(draftScope));
      if (raw) {
        const value = restoreDialogueDraft(
          raw,
          readyVoices,
          currentProject ? { projectId: currentProject.id } : { allowUnbound: restoreUnboundDraft }
        );
        restored = { ...value, ...buildDialogueInput(value, {}, initialOrganizationId) };
      }
    } catch {
      /* Local storage is optional. */
    }
    if (currentProject) {
      if (restored?.projectId === currentProject.id && restored.revision === currentProject.revision) {
        draftRef.current = restored;
        setDraft(restored);
        setProject(currentProject);
        onProjectChange(currentProject);
        setSelectedId(restored.segments[0]?.id ?? "");
      } else {
        if (restored?.projectId === currentProject.id) draftRef.current.sourceText = restored.sourceText;
        adopt(currentProject);
      }
      setDraftReady(true);
      return;
    }
    const next = restored ?? {
      ...createDialogueDraft(),
      billingContext: initialOrganizationId ? "ORGANIZATION" : "PERSONAL",
      ...(initialOrganizationId ? { organizationId: initialOrganizationId } : {})
    };
    draftRef.current = next;
    setDraft(next);
    setProject(null);
    setSelectedId(next.segments[0]?.id ?? "");
    setDraftReady(true);
    // The server-selected project wins only on navigation; polling never replaces an edited draft.
  }, [currentProject?.id, draftScope, restoreUnboundDraft]);

  useEffect(() => {
    if (!draftReady || (!currentProject && !restoreUnboundDraft)) return;
    try {
      window.localStorage.setItem(dialogueDraftKey(draftScope), JSON.stringify(draft));
    } catch {
      /* Keep the in-memory draft. */
    }
  }, [currentProject, draft, draftReady, draftScope, restoreUnboundDraft]);

  useEffect(() => {
    if (!active || !loggedIn || !draftReady) return;
    const id = draft.projectId ?? project?.id;
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const latest = await requestVoiceDialogue<DialogueProject>("project", {
          projectId: id,
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        setProject(latest);
        onProjectChange(latest);
        if (isDialogueBusy(latest.status)) timer = setTimeout(poll, 2000);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(dialogueFriendlyError(reason instanceof Error ? reason.message : reason));
        timer = setTimeout(poll, 5000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [active, loggedIn, draftReady, draft.projectId, draft.revision, project?.generationId, project?.status, onProjectChange]);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      setQuoted(null);
      setSourceOpen(false);
      preview.current?.pause();
      completeAudio.current?.pause();
      setPlayingId(null);
    }
  }, [active]);

  useEffect(() => {
    setQuoted(null);
    editVersion.current++;
  }, [models, voices, initialOrganizationId]);

  useEffect(() => {
    const dialog = feeDialog.current;
    if (quoted && active) {
      if (!dialog?.open) dialog?.showModal();
    } else if (dialog?.open) dialog.close();
    setExpired(false);
    if (!quoted) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(quoted.quote.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [quoted, active]);

  useEffect(() => {
    const dialog = sourceDialog.current;
    if (sourceOpen) {
      if (!dialog?.open) dialog?.showModal();
    } else if (dialog?.open) dialog.close();
  }, [sourceOpen]);

  useEffect(
    () => () => {
      actionRequest.current?.abort();
      preview.current?.pause();
      completeAudio.current?.pause();
    },
    []
  );

  function updateSegment(changes: Partial<DialogueDraft["segments"][number]>) {
    if (!selected) return;
    edit((value) => ({
      ...value,
      segments: value.segments.map((segment) => (segment.id === selected.id ? { ...segment, ...changes } : segment))
    }));
  }

  function addSpeaker() {
    if (draft.speakers.length >= 20) return;
    edit((value) => ({
      ...value,
      speakers: [
        ...value.speakers,
        {
          id: `speaker-${crypto.randomUUID()}`,
          name: `角色 ${value.speakers.length + 1}`,
          voiceValue: readyVoices[0]?.value ?? ""
        }
      ]
    }));
  }

  function addSegment() {
    if (draft.segments.length >= 100) return;
    const id = `segment-${crypto.randomUUID()}`;
    edit((value) => {
      const speakers = value.speakers.length
        ? value.speakers
        : [{ id: `speaker-${crypto.randomUUID()}`, name: "角色 1", voiceValue: readyVoices[0]?.value ?? "" }];
      return {
        ...value,
        speakers,
        segments: [...value.segments, { id, speakerId: speakers[0].id, text: "", speed: 1, pauseSeconds: 1 }]
      };
    });
    setSelectedId(id);
  }

  function recognize() {
    const parsed = parseVoiceDialogue(draftRef.current.sourceText, draftRef.current);
    if (
      parsed.speakers.length > 20 ||
      parsed.segments.length > 100 ||
      parsed.segments.reduce((sum, segment) => sum + segment.text.length, 0) > 8000
    ) {
      setError("对话最多包含 20 个角色、100 段和 8000 字符");
      return;
    }
    const speakers = parsed.speakers.map((speaker) => ({
      ...speaker,
      voiceValue: draft.speakers.some((old) => old.id === speaker.id)
        ? speaker.voiceValue
        : (readyVoices[0]?.value ?? "")
    }));
    if (!speakers.length)
      speakers.push({ id: `speaker-${crypto.randomUUID()}`, name: "角色 1", voiceValue: readyVoices[0]?.value ?? "" });
    edit((value) => ({ ...value, ...parsed, speakers }));
    setSelectedId(parsed.segments[0]?.id ?? "");
    setSourceOpen(false);
  }

  async function getQuote(segmentId?: string, mergeOnly = false) {
    if (!loggedIn || locked || pending !== null || submitting.current) return;
    actionRequest.current?.abort();
    const controller = new AbortController();
    actionRequest.current = controller;
    const input = buildDialogueInput(draftRef.current, segmentId ? { segmentId } : {}, initialOrganizationId);
    const validation = validateDialogueInput(input, readyVoices, models);
    if (validation) {
      setError(validation);
      return;
    }
    const version = editVersion.current;
    setError("");
    setQuoted(null);
    setPending("quote");
    try {
      const quote = await requestVoiceDialogue<DialogueQuote>("quote", { body: input, signal: controller.signal });
      if (controller.signal.aborted) return;
      const next = applyDialogueQuoteMetadata(draftRef.current, quote);
      draftRef.current = next;
      setDraft(next);
      if (version !== editVersion.current || !activeRef.current) return;
      if (mergeOnly && quote.totalCredits !== 0) {
        setError("部分句子无法复用，请重新确认生成费用；此次未提交合成");
        return;
      }
      setQuoted({
        quote,
        key: dialogueInputKey(buildDialogueInput(next, segmentId ? { segmentId } : {}, initialOrganizationId)),
        segmentId,
        mergeOnly
      });
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(dialogueFriendlyError(reason instanceof Error ? reason.message : reason));
    } finally {
      if (actionRequest.current === controller) {
        actionRequest.current = null;
        setPending(null);
      }
    }
  }

  async function confirmQuote() {
    if (!quoted || submitting.current) return;
    const input = buildDialogueInput(draftRef.current, quoted.segmentId ? { segmentId: quoted.segmentId } : {}, initialOrganizationId);
    if (!quoteIsCurrent(quoted.quote, quoted.key, input)) {
      setExpired(true);
      setError("费用确认已过期或内容已变化，请重新确认");
      return;
    }
    submitting.current = true;
    const controller = new AbortController();
    actionRequest.current = controller;
    setPending("confirm");
    setError("");
    try {
      const result = await requestVoiceDialogue<DialogueProject>("generate", {
        body: { quoteId: quoted.quote.id },
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      adopt(result);
      setQuoted(null);
      const url = new URL(window.location.href);
      url.search = new URLSearchParams({ project: result.id }).toString();
      window.history.replaceState(null, "", url);
    } catch (reason) {
      if (!controller.signal.aborted) {
        const message = dialogueFriendlyError(reason instanceof Error ? reason.message : reason);
        setError(message);
        if (/过期|已变化|已更新|重新确认费用/.test(message)) setExpired(true);
      }
      // Keep the quote ID for an idempotent retry after an uncertain response.
    } finally {
      submitting.current = false;
      if (actionRequest.current === controller) {
        actionRequest.current = null;
        setPending(null);
      }
    }
  }

  function playSentence() {
    if (!selected) return;
    if (playingId === selected.id) {
      stopPreview();
      return;
    }
    const url = dialogueSegmentAudio(project, draft, selected.id);
    if (!url) return;
    stopPreview();
    const audio = new Audio(url);
    preview.current = audio;
    setPlayingId(selected.id);
    audio.onended = () => {
      if (preview.current === audio) stopPreview();
    };
    void audio.play().catch(() => {
      if (preview.current === audio) {
        stopPreview();
        setError("音频播放失败，请稍后重试");
      }
    });
  }

  return (
    <div className="grid min-h-0 min-w-0 gap-5 xl:h-full xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm xl:min-h-0">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {draft.segments.length ? (
            draft.segments.map((segment, index) => {
              const speaker = draft.speakers.find((role) => role.id === segment.speakerId);
              const voice = readyVoices.find((option) => option.value === speaker?.voiceValue);
              const label = `${speaker?.name ?? "未分配角色"} · ${voice?.name ?? "未选择音色"}`;
              return (
                <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 py-2" key={segment.id}>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      aria-label={label}
                      className="size-8 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      onClick={() => setSelectedId(segment.id)}
                      title={label}
                      type="button"
                    >
                      <Image
                        alt=""
                        className="size-8 rounded-full object-cover"
                        height={32}
                        src={resolveVoiceAvatar(voice ?? { value: "", name: "", badge: "" })}
                        width={32}
                      />
                    </button>
                    <Button
                      aria-label={`设置第 ${index + 1} 段`}
                      aria-pressed={selected?.id === segment.id}
                      className="size-8 rounded-lg px-0"
                      onClick={() => setSelectedId(segment.id)}
                      title={`设置第 ${index + 1} 段`}
                      type="button"
                      variant={selected?.id === segment.id ? "outline" : "ghost"}
                    >
                      <Settings2 className="size-4" />
                    </Button>
                  </div>
                  <DialogueParagraph
                    index={index}
                    disabled={locked}
                    onChange={(text) =>
                      edit((value) => ({
                        ...value,
                        segments: value.segments.map((row) => (row.id === segment.id ? { ...row, text } : row))
                      }))
                    }
                    onFocus={() => setSelectedId(segment.id)}
                    value={segment.text}
                  />
                </div>
              );
            })
          ) : (
            <Textarea
              aria-label="对话原稿"
              className="min-h-[360px] w-full resize-none rounded-none border-0 bg-transparent p-0 text-base leading-8 shadow-none placeholder:text-muted-foreground focus:placeholder:text-transparent focus:ring-0 md:text-base"
              disabled={locked}
              maxLength={20000}
              onChange={(event) => edit((value) => ({ ...value, sourceText: event.target.value }))}
              placeholder="请输入或粘贴要转换为语音的文字"
              value={draft.sourceText}
            />
          )}
        </div>
        {playback ? (
          <div className="flex shrink-0 flex-col gap-3 border-t border-border p-5">
            <span className="text-sm font-medium">
              {playback.current ? "完整音频" : "旧版完整音频"} · 版本 {playback.revision}
            </span>
            <div className="flex min-w-0 items-center gap-3">
              <audio className="w-0 min-w-0 flex-1" controls controlsList="nodownload noplaybackrate noremoteplayback" key={playback.url} ref={completeAudio} src={playback.url} />
              <VoiceDownloadButton label={playback.current ? "下载完整音频" : "下载旧版完整音频"} target={{ project: project!.id, revision: playback.revision }} />
            </div>
          </div>
        ) : null}
      </section>

      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm xl:w-[360px]">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-5">
            {modeControl}
            <fieldset className="flex min-w-0 flex-col gap-5" disabled={locked}>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  aria-label="粘贴或识别对话"
                  className="size-9 px-0"
                  onClick={() => setSourceOpen(true)}
                  title="粘贴或识别对话"
                  type="button"
                  variant="outline"
                >
                  <ClipboardPaste />
                </Button>
                <Button
                  disabled={!draft.sourceText.trim()}
                  onClick={recognize}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  识别角色
                </Button>
                <Button
                  aria-label="添加段落"
                  className="size-9 px-0"
                  disabled={draft.segments.length >= 100}
                  onClick={addSegment}
                  title="添加段落"
                  type="button"
                  variant="outline"
                >
                  <Plus />
                </Button>
              </div>
              <section className="flex min-w-0 flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">角色映射</h2>
                  <Button
                    aria-label="添加角色"
                    className="size-8 px-0"
                    disabled={draft.speakers.length >= 20}
                    onClick={addSpeaker}
                    title="添加角色"
                    type="button"
                    variant="ghost"
                  >
                    <Plus />
                  </Button>
                </div>
                {readyVoices.length === 0 ? (
                  <p className="text-sm text-destructive">暂无已就绪音色，暂时无法生成多人配音</p>
                ) : null}
                {draft.speakers.map((speaker) => (
                  <div className="flex min-w-0 flex-col gap-2" key={speaker.id}>
                    <div className="flex min-w-0 items-center gap-2">
                      <Input
                        aria-label="角色名称"
                        className="min-w-0 flex-1"
                        maxLength={80}
                        onChange={(event) =>
                          edit((value) => ({
                            ...value,
                            speakers: value.speakers.map((role) =>
                              role.id === speaker.id ? { ...role, name: event.target.value } : role
                            )
                          }))
                        }
                        value={speaker.name}
                      />
                      <Button
                        aria-label={`删除角色${speaker.name}`}
                        className="size-8 px-0"
                        disabled={draft.segments.some((segment) => segment.speakerId === speaker.id)}
                        onClick={() =>
                          edit((value) => ({
                            ...value,
                            speakers: value.speakers.filter((role) => role.id !== speaker.id)
                          }))
                        }
                        title="删除未使用的角色"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <VoicePicker
                      disabled={locked || !readyVoices.length}
                      label={
                        readyVoices.some((voice) => voice.value === speaker.voiceValue) ? "" : "未绑定音色，请选择"
                      }
                      onChange={(voiceValue) =>
                        edit((value) => ({
                          ...value,
                          speakers: value.speakers.map((role) =>
                            role.id === speaker.id ? { ...role, voiceValue } : role
                          )
                        }))
                      }
                      value={speaker.voiceValue}
                      voices={readyVoices}
                    />
                  </div>
                ))}
              </section>
              {selected ? (
                <section className="flex min-w-0 flex-col gap-4 border-t border-border pt-5">
                  <h2 className="text-base font-semibold">第 {draft.segments.indexOf(selected) + 1} 段设置</h2>
                  <label className="flex flex-col gap-2 text-sm font-semibold">
                    角色
                    <Select
                      onChange={(event) => updateSegment({ speakerId: event.target.value })}
                      value={selected.speakerId}
                    >
                      <option value="">请选择角色</option>
                      {draft.speakers.map((speaker) => (
                        <option key={speaker.id} value={speaker.id}>
                          {speaker.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <NumberSetting
                    label="语速"
                    max={2.0}
                    min={0.5}
                    onChange={(speed) => updateSegment({ speed })}
                    suffix="倍"
                    value={selected.speed}
                  />
                  {selectedVoice && !selectedModel?.isConfigured ? (
                    <p className="text-sm text-destructive">当前音色暂无兼容模型</p>
                  ) : null}
                  {selected.speed < speedBounds.min || selected.speed > speedBounds.max ? (
                    <p className="text-sm text-destructive">
                      请将语速调整为 {speedBounds.min}–{speedBounds.max} 倍
                    </p>
                  ) : null}
                  <NumberSetting
                    label="段尾停顿"
                    max={3}
                    min={0}
                    onChange={(pauseSeconds) => updateSegment({ pauseSeconds })}
                    step={0.5}
                    suffix="秒"
                    value={selected.pauseSeconds}
                  />
                  <div className="flex gap-2">
                    <Button
                      aria-label={playingId === selected.id ? "停止试听" : "试听当前句"}
                      className="size-9 px-0"
                      disabled={!dialogueSegmentAudio(project, draft, selected.id)}
                      onClick={playSentence}
                      title={playingId === selected.id ? "停止试听" : "试听当前句"}
                      type="button"
                      variant="outline"
                    >
                      <Play />
                    </Button>
                    <Button
                      aria-label="重新合成当前句"
                      className="size-9 px-0"
                      disabled={!loggedIn || pending !== null}
                      onClick={() => void getQuote(selected.id)}
                      title="重新合成当前句"
                      type="button"
                      variant="outline"
                    >
                      <RotateCcw />
                    </Button>
                    <Button
                      aria-label="删除当前段落"
                      className="size-9 px-0"
                      onClick={() =>
                        edit((value) => ({
                          ...value,
                          segments: value.segments.filter((segment) => segment.id !== selected.id)
                        }))
                      }
                      title="删除当前段落"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    当前句 ·{" "}
                    {selectedClipUrl
                      ? "已就绪"
                      : selectedMatchesSaved && savedSelected?.status !== "SUCCEEDED"
                        ? dialogueStatusName(savedSelected?.status)
                        : "待生成"}
                  </p>
                  {savedSelected?.errorMessage && selectedMatchesSaved ? (
                    <p className="text-sm text-destructive">{dialogueFriendlyError(savedSelected.errorMessage)}</p>
                  ) : null}
                </section>
              ) : null}
            </fieldset>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-3 border-t border-border p-5">
          {project ? (
            <p aria-live="polite" className="flex items-center gap-2 text-sm">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {statusLabel} · {completed} / {draft.segments.length} 句 · 已扣{" "}
              {project.actualCredits.toLocaleString("zh-CN")} 点
            </p>
          ) : null}
          {project?.audioUrl && !currentOutput ? (
            <p className="text-xs text-muted-foreground">
              已有版本 {project.outputRevision} 音频，尚未生成当前完整音频
            </p>
          ) : null}
          {error || project?.errorMessage ? (
            <p aria-live="polite" className="text-sm text-destructive" role="alert">
              {error || dialogueFriendlyError(project?.errorMessage)}
            </p>
          ) : null}
          <div className="flex items-center">
            {loggedIn ? (
              <Button
                className="min-w-0 flex-1"
                disabled={locked || pending !== null || !draftReady || !readyVoices.length}
                onClick={() => void getQuote()}
                type="button"
              >
                {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles />}
                {pending === "quote" ? "获取费用中" : busy ? "处理中" : "生成语音"}
              </Button>
            ) : (
              <Button asChild className="flex-1">
                <Link href="/login?next=%2Fvoice">登录后合成</Link>
              </Button>
            )}
          </div>
        </div>
      </aside>

      <dialog
        aria-labelledby="dialogue-fee-title"
        className="m-auto max-h-[85dvh] w-[760px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/30"
        onCancel={(event) => {
          if (pending === "confirm") event.preventDefault();
          else setQuoted(null);
        }}
        ref={feeDialog}
      >
        {quoted ? (
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold" id="dialogue-fee-title">
                {quoted.segmentId ? "单句合成费用" : "配音费用确认"}
              </h2>
              <Button
                aria-label="关闭费用确认"
                className="size-8 px-0"
                disabled={pending === "confirm"}
                onClick={() => setQuoted(null)}
                title="关闭"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    {["角色 / 音色", "模型", "计费字符", "点数"].map((label) => (
                      <th className="border-b border-border p-2 font-medium" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quoted.quote.segments.map((segment) => (
                    <tr key={segment.id}>
                      <td className="border-b border-border p-2">
                        <span className="block break-words">{segment.speakerName}</span>
                        <span className="text-xs text-muted-foreground">{segment.voiceName}</span>
                      </td>
                      <td className="break-all border-b border-border p-2 text-xs">{segment.modelName}</td>
                      <td className="border-b border-border p-2 tabular-nums">
                        {segment.billingCharacters.toLocaleString("zh-CN")}
                      </td>
                      <td className="border-b border-border p-2 tabular-nums">
                        {segment.reused
                          ? "复用 · 0"
                          : quoted.segmentId && segment.id !== quoted.segmentId
                            ? "未生成 · 0"
                            : segment.credits.toLocaleString("zh-CN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-base font-semibold">
              总计 {quoted.quote.totalCredits.toLocaleString("zh-CN")} 点 ·{" "}
              {initialOrganizationId ? "企业空间" : "个人空间"}
            </p>
            <p className="text-xs text-muted-foreground">
              有效至 {new Date(quoted.quote.expiresAt).toLocaleTimeString("zh-CN")}
            </p>
            {expired ? (
              <p className="text-sm text-destructive" role="alert">
                费用确认已失效，请重新获取报价
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-3">
              <Button disabled={pending === "confirm"} onClick={() => setQuoted(null)} type="button" variant="outline">
                取消
              </Button>
              {expired ? (
                <Button
                  disabled={pending !== null}
                  onClick={() => void getQuote(quoted.segmentId, quoted.mergeOnly)}
                  type="button"
                >
                  重新获取报价
                </Button>
              ) : (
                <Button disabled={pending === "confirm"} onClick={() => void confirmQuote()} type="button">
                  {pending === "confirm" ? <LoaderCircle className="animate-spin" /> : null}
                  {pending === "confirm"
                    ? "提交中"
                    : quoted.quote.totalCredits === 0
                      ? "确认免费处理"
                      : `确认并冻结 ${quoted.quote.totalCredits.toLocaleString("zh-CN")} 点`}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </dialog>
      <dialog
        aria-labelledby="dialogue-source-title"
        className="m-auto w-[640px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/30"
        onCancel={() => setSourceOpen(false)}
        ref={sourceDialog}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold" id="dialogue-source-title">
              对话原稿
            </h2>
            <Button
              aria-label="关闭原稿"
              className="size-8 px-0"
              onClick={() => setSourceOpen(false)}
              title="关闭"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
          <Textarea
            aria-label="对话识别原稿"
            className="h-[40dvh] resize-none text-base leading-8"
            disabled={locked}
            maxLength={20000}
            onChange={(event) => edit((value) => ({ ...value, sourceText: event.target.value }))}
            value={draft.sourceText}
          />
          {draft.segments.length ? (
            <p className="text-sm text-muted-foreground">重新识别将替换当前段落；原稿会保留</p>
          ) : null}
          <Button disabled={locked || !draft.sourceText.trim()} onClick={recognize} type="button">
            识别角色
          </Button>
        </div>
      </dialog>
    </div>
  );
}

function DialogueParagraph({
  index,
  value,
  disabled,
  onChange,
  onFocus
}: {
  index: number;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  const elementRef = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const resize = () => {
      element.style.height = "auto";
      element.style.height = `${Math.max(64, element.scrollHeight)}px`;
    };
    resize();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);
  return (
    <Textarea
      aria-label={`第 ${index + 1} 段正文`}
      maxLength={20000}
      className="min-h-16 w-full resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 text-base leading-8 shadow-none focus:ring-0 md:text-base"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      placeholder="输入正文"
      ref={elementRef}
      rows={2}
      value={value}
    />
  );
}

function NumberSetting({
  label,
  min,
  max,
  value,
  suffix,
  onChange,
  step = 0.1
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  suffix: string;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-3 text-sm font-semibold">
      <span className="flex items-center justify-between gap-3">
        {label}
        <span className="text-sm font-medium">
          {Number.isFinite(value) ? value : "-"} {suffix}
        </span>
      </span>
      <input
        aria-label={label}
        className="w-full accent-primary"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={Number.isFinite(value) ? value : min}
      />
    </label>
  );
}
