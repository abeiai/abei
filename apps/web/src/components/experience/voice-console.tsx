"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AudioLines,
  History,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Sparkles,
  WandSparkles
} from "lucide-react";

import { VoicePicker } from "@/components/audio/voice-picker";
import { VoiceDownloadButton } from "@/components/audio/voice-download-button";
import { VoiceDialogueConsole } from "@/components/experience/voice-dialogue-console";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PublicUser } from "@/lib/auth-actions";
import { cosyVoiceV35PresetPrefix, resolveCosyVoiceV35Selection } from "@/lib/cosyvoice-v35-presets";
import type { UserOrganizationsResult } from "@/lib/organizations-api";
import { cn } from "@/lib/utils";
import { resolveAutomaticVoiceModel, type VoicePickerOption } from "@/lib/voice-picker";
import { dialogueDraftKey, dialogueSpeedBounds, dialogueStatusName, type DialogueProject } from "@/lib/voice-dialogue";

export interface VoiceModelOption {
  aliasKey: string;
  displayName: string;
  statusName: string;
  providerName: string | null;
  modelName: string | null;
  isConfigured: boolean;
  inputPrice: string;
  outputPrice: string;
  pricingMode: "TOKENS" | "TOKEN_CACHE" | "TOKEN_TIERED" | "REQUEST" | "CHARACTERS" | "IMAGES" | "SECONDS" | "VIDEO_SECONDS";
  pricingUnit: "K_TOKENS" | "M_TOKENS" | "REQUEST" | "CHARACTER" | "K_CHARACTERS" | "TEN_K_CHARACTERS" | "IMAGE" | "SECOND";
  creditsPerCny: number;
}

export type VoiceOption = VoicePickerOption;

export interface VoiceTaskItem {
  id: string;
  title: string;
  status: string;
  statusName: string;
  createdAt: string;
  createdAtIso?: string;
  audioUrl: string | null;
  voiceName: string;
  credits: number;
}

export interface CurrentVoiceTask extends VoiceTaskItem {
  text: string | null;
  errorMessage: string | null;
}

interface VoiceConsoleProps {
  currentUser: PublicUser | null;
  models: VoiceModelOption[];
  voices: VoiceOption[];
  history: VoiceTaskItem[];
  currentTask: CurrentVoiceTask | null;
  error?: string;
  createAction: (formData: FormData) => void | Promise<void>;
  initialOrganizationId?: string;
  initialVoiceValue?: string;
  organizations: UserOrganizationsResult | null;
  currentProject?: DialogueProject | null;
  dialogueHistory?: DialogueProject[];
  draftScope?: string;
}

const textLimit = 5000;
const defaultVoiceValue = `${cosyVoiceV35PresetPrefix}announcer`;
const voiceDraftKey = "xueleai:experience-voice:draft";
const emptyDialogueHistory: DialogueProject[] = [];

interface VoiceConsoleDraft {
  text?: string;
  selectedVoice?: string;
  speed?: string;
  volume?: string;
}

export function VoiceConsole({
  currentUser,
  models,
  voices,
  history,
  currentTask,
  error,
  createAction,
  initialOrganizationId = "",
  initialVoiceValue,
  currentProject = null,
  dialogueHistory = emptyDialogueHistory,
  draftScope = "guest"
}: VoiceConsoleProps) {
  const [mode, setMode] = useState<"single" | "dialogue">(currentProject ? "dialogue" : "single");
  const [newGenerationRevision, setNewGenerationRevision] = useState(0);
  const [projects, setProjects] = useState(dialogueHistory);
  const onProjectChange = useCallback((project: DialogueProject) => {
    setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 30));
  }, []);
  useEffect(() => { setProjects(dialogueHistory); }, [dialogueHistory]);
  useEffect(() => { setMode(currentProject ? "dialogue" : "single"); }, [currentProject?.id, currentTask?.id]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [text, setText] = useState(currentTask?.text ?? "");
  const initialSelectedVoice = resolveInitialVoiceValue(voices, initialVoiceValue);
  const [selectedVoice, setSelectedVoice] = useState(initialSelectedVoice);
  const [speed, setSpeed] = useState("1");
  const [volume, setVolume] = useState("1");
  const [draftReady, setDraftReady] = useState(Boolean(currentTask));

  const selectedVoiceOption = useMemo(
    () => voices.find((voice) => voice.value === selectedVoice) ?? voices[0],
    [selectedVoice, voices]
  );
  const selectedModelOption = useMemo(
    () => resolveAutomaticVoiceModel(models, selectedVoiceOption),
    [models, selectedVoiceOption]
  );
  const billingContext = initialOrganizationId ? "ORGANIZATION" : "PERSONAL";
  const selectedModelReady = Boolean(selectedModelOption?.isConfigured);
  const speedBounds = dialogueSpeedBounds(selectedModelOption?.modelName);
  const speedValid = Number(speed) >= speedBounds.min && Number(speed) <= speedBounds.max;
  const canSubmit = Boolean(currentUser && text.trim().length > 0 && text.length <= textLimit && selectedVoiceOption && selectedModelReady && speedValid);
  const mergedHistory = useMemo(() => [
    ...history.map((task) => ({ id: `single:${task.id}`, title: task.title, status: task.statusName, date: task.createdAt, timestamp: task.createdAtIso ?? "", href: `/voice?task=${encodeURIComponent(task.id)}`, selected: currentTask?.id === task.id })),
    ...projects.map((project) => ({ id: `dialogue:${project.id}`, title: project.title, status: `多人 · ${dialogueStatusName(project.status)}`, date: new Date(project.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }), timestamp: project.createdAt, href: `/voice?project=${encodeURIComponent(project.id)}`, selected: currentProject?.id === project.id }))
  ].sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)).slice(0, 30), [history, projects, currentTask?.id, currentProject?.id]);
  const modeControl = (
    <div aria-label="配音模式" className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1" role="group">
      {([ ["single", "单人配音"], ["dialogue", "多人配音"] ] as const).map(([value, label]) => (
        <button aria-pressed={mode === value} className={cn("h-9 min-w-0 rounded-md text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary", mode === value ? "bg-background shadow-sm" : "text-muted-foreground")} key={value} onClick={() => setMode(value)} type="button">{label}</button>
      ))}
    </div>
  );

  function startNewGeneration() {
    try {
      window.localStorage.removeItem(voiceDraftKey);
      window.localStorage.removeItem(dialogueDraftKey(draftScope));
    } catch {
      /* Local storage is optional. */
    }
    setMode("single");
    setText("");
    setSelectedVoice(initialSelectedVoice);
    setSpeed("1");
    setVolume("1");
    setDraftReady(true);
    setNewGenerationRevision((value) => value + 1);
  }

  useEffect(() => {
    if (!currentTask) {
      return;
    }

    setSelectedVoice(initialSelectedVoice);
  }, [currentTask?.id, initialSelectedVoice]);

  useEffect(() => {
    if (currentTask?.text === undefined || currentTask.text === null) {
      return;
    }

    setText(currentTask.text);
  }, [currentTask?.id, currentTask?.text]);

  useEffect(() => {
    if (currentTask) {
      setDraftReady(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(voiceDraftKey);
      if (!raw) {
        setDraftReady(true);
        return;
      }

      const draft = JSON.parse(raw) as unknown;
      if (!isVoiceConsoleDraft(draft)) {
        setDraftReady(true);
        return;
      }

      if (typeof draft.text === "string") {
        setText(draft.text.slice(0, textLimit));
      }

      const restoredVoice = draft.selectedVoice && resolveCosyVoiceV35Selection(draft.selectedVoice, voices);
      if (restoredVoice) {
        setSelectedVoice(restoredVoice);
      }

      if (draft.speed) {
        setSpeed(draft.speed);
      }

      if (draft.volume) {
        const value = Number(draft.volume);
        setVolume(Number.isFinite(value) ? String(Math.min(2, Math.max(0.5, value))) : "1");
      }
    } catch {
      window.localStorage.removeItem(voiceDraftKey);
    } finally {
      setDraftReady(true);
    }
  }, [currentTask, voices]);

  useEffect(() => {
    if (currentTask || !draftReady) {
      return;
    }

    window.localStorage.setItem(
      voiceDraftKey,
      JSON.stringify({
        text,
        selectedVoice,
        speed,
        volume
      } satisfies VoiceConsoleDraft)
    );
  }, [currentTask, draftReady, selectedVoice, speed, text, volume]);

  useEffect(() => {
    if (voices.length === 0 || voices.some((voice) => voice.value === selectedVoice)) {
      return;
    }

    setSelectedVoice(voices.find((voice) => voice.isDefault)?.value ?? voices[0].value);
  }, [selectedVoice, voices]);

  return (
    <main
      className={cn(
        "grid min-h-[calc(100dvh-4.5rem)] min-w-0 grid-cols-1 gap-5 bg-[#f6f6f5] p-5 text-foreground xl:h-[calc(100dvh-4.5rem)] xl:min-h-0 xl:overflow-hidden",
        sidebarCollapsed ? "xl:grid-cols-[76px_minmax(0,1fr)]" : "xl:grid-cols-[292px_minmax(0,1fr)]"
      )}
    >
      <aside className="flex min-h-0 min-w-0 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <Link className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-normal" href="/">
            <AudioLines className="size-7" />
            {!sidebarCollapsed ? <span className="truncate">语音合成</span> : null}
          </Link>
          <Button
            aria-label={sidebarCollapsed ? "展开左栏" : "收起左栏"}
            className="hidden size-9 px-0 xl:inline-flex"
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
            variant="ghost"
          >
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>

        <div className="flex shrink-0 flex-col gap-2 px-4 pb-5">
          <Link
            aria-label="新建生成"
            className={cn(
              "xueleai-button flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-background text-sm font-medium shadow-sm hover:bg-secondary",
              sidebarCollapsed ? "px-0" : "px-4"
            )}
            href="/voice"
            onClick={startNewGeneration}
            title="新建生成"
          >
            <Plus className="size-4" data-icon="inline-start" />
            {!sidebarCollapsed ? <span>新建生成</span> : null}
          </Link>
        </div>

        <div className="max-h-48 min-h-0 flex-1 overflow-y-auto px-4 pb-4 xl:max-h-none">
          {!sidebarCollapsed ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <History className="size-4" />
                <span>语音合成历史</span>
              </div>
              {mergedHistory.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {mergedHistory.map((task) => (
                    <Link
                      className={cn(
                        "flex flex-col gap-1 rounded-xl px-3 py-3 text-sm transition-colors hover:bg-secondary",
                        task.selected ? "bg-secondary text-foreground" : "text-muted-foreground"
                      )}
                      href={task.href}
                      key={task.id}
                    >
                      <span className="line-clamp-2 font-medium text-foreground">{task.title}</span>
                      <span className="flex items-center justify-between gap-2 text-xs">
                        <span>{task.status}</span>
                        <span>{task.date}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card px-3 py-5 text-sm leading-6 text-muted-foreground">
                  暂无历史记录
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 pt-2 text-muted-foreground">
              <History className="size-5" />
              <span className="[writing-mode:vertical-rl] text-xs">历史</span>
            </div>
          )}
        </div>

      </aside>

      <form action={createAction} className={cn("min-h-0 min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]", mode === "single" ? "grid" : "hidden")}>
        <input name="billingContext" type="hidden" value={billingContext} />
        {initialOrganizationId ? <input name="organizationId" type="hidden" value={initialOrganizationId} /> : null}
            <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm xl:min-h-0">
              <div className="relative flex min-h-[360px] flex-1 flex-col xl:min-h-0">
                <Textarea
                  className="min-h-[360px] flex-1 resize-none rounded-none border-0 bg-transparent p-6 pb-14 text-base leading-8 shadow-none placeholder:text-muted-foreground focus:border-transparent focus:placeholder:text-transparent focus:ring-0 md:text-base xl:min-h-0"
                  maxLength={textLimit}
                  minLength={1}
                  name="text"
                  onChange={(event) => setText(event.target.value)}
                  placeholder="请输入或粘贴要转换为语音的文字"
                  required
                  value={text}
                />
                <p aria-label="字符计数" className="pointer-events-none absolute bottom-4 right-6 whitespace-nowrap text-xs text-muted-foreground">
                  {text.length.toLocaleString("zh-CN")} / {textLimit.toLocaleString("zh-CN")} 字符
                </p>
              </div>
              <div className="shrink-0 border-t border-border p-5"><VoiceResult task={currentTask} /></div>
            </section>

            <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm xl:w-[360px]">
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="flex flex-col gap-6">
                  {modeControl}
                  <div className="flex flex-col gap-3">
                    <input name="voiceChoice" type="hidden" value={selectedVoice} />
                    <VoicePicker onChange={setSelectedVoice} value={selectedVoice} voices={voices} />
                  </div>

                  <RangeField label="语速" max="2.0" min="0.5" name="speed" onChange={setSpeed} step="0.1" value={speed} />
                  {!speedValid ? <p className="text-sm text-destructive">请将语速调整为 {speedBounds.min}–{speedBounds.max} 倍</p> : null}
                  <input name="pitch" type="hidden" value="0" />
                  <RangeField label="音量" max="2" min="0.5" name="volume" onChange={setVolume} step="0.1" value={volume} />
                  <input name="languageDetection" type="hidden" value="auto" />
                  <input name="format" type="hidden" value="wav" />
                  <input name="sampleRate" type="hidden" value="24000" />
                </div>
              </div>
        <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-background p-5">
          {error ? (
            <div className="mb-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              操作失败：{error}
            </div>
          ) : null}
          <div className="flex justify-center">
              {currentUser ? (
                <VoiceSubmitButton disabled={!canSubmit} />
              ) : (
                <Button asChild>
                  <Link href={`/login?next=${encodeURIComponent("/voice")}`}>
                    <LogIn data-icon="inline-start" />
                    登录后合成
                  </Link>
                </Button>
              )}
          </div>
        </div>
            </aside>
      </form>
      <div className={cn("min-h-0 min-w-0", mode === "dialogue" ? "block" : "hidden")}>
        <VoiceDialogueConsole
          active={mode === "dialogue"}
          currentProject={currentProject}
          draftScope={draftScope}
          initialOrganizationId={initialOrganizationId}
          key={`${draftScope}:${currentProject?.id ?? currentTask?.id ?? "new"}:${newGenerationRevision}`}
          loggedIn={Boolean(currentUser)}
          modeControl={modeControl}
          models={models}
          onProjectChange={onProjectChange}
          restoreUnboundDraft={!currentTask}
          voices={voices}
        />
      </div>
    </main>
  );
}

function isVoiceConsoleDraft(value: unknown): value is VoiceConsoleDraft {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveInitialVoiceValue(voices: VoiceOption[], requestedValue?: string) {
  if (requestedValue) {
    const matchedValue = resolveCosyVoiceV35Selection(requestedValue, voices);
    if (matchedValue) return matchedValue;
  }

  return voices.find((voice) => voice.isDefault)?.value ?? voices[0]?.value ?? defaultVoiceValue;
}

function RangeField({
  label,
  max,
  min,
  name,
  onChange,
  step,
  value
}: {
  label: string;
  max: string;
  min: string;
  name: string;
  onChange: (value: string) => void;
  step: string;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-3">
      <span className="flex items-center justify-between gap-3 text-sm font-semibold">
        {label}
        <span className="min-w-12 rounded-lg bg-secondary px-3 py-1 text-center text-sm font-medium">{value}</span>
      </span>
      <input
        className="h-2 accent-primary"
        max={max}
        min={min}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function VoiceResult({ task }: { task: CurrentVoiceTask | null }) {
  if (!task) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Play className="size-4" />
        生成完成后，播放条会出现在这里。
      </div>
    );
  }

  if (task.status === "FAILED") {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <span className="font-medium text-foreground">合成失败</span>
        <span className="text-muted-foreground">{task.errorMessage ?? "语音合成失败，冻结点数已释放。"}</span>
      </div>
    );
  }

  if (!task.audioUrl) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <WandSparkles className="size-4" />
        {task.statusName}，刷新后可查看最新播放结果。
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">生成结果 · {task.voiceName}</span>
        <span className="text-muted-foreground">消耗 {task.credits.toLocaleString("zh-CN")} 点</span>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <audio className="w-full min-w-0 flex-1" controls controlsList="nodownload noplaybackrate noremoteplayback" src={task.audioUrl} />
        <VoiceDownloadButton target={{ task: task.id }} />
      </div>
    </div>
  );
}

function VoiceSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} type="submit">
      <Sparkles data-icon="inline-start" />
      {pending ? "生成中..." : "生成语音"}
    </Button>
  );
}
