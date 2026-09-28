"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Circle, Eraser, Pause, Play, Shuffle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PlatformVoiceDesignAction = (formData: FormData) => void | Promise<void>;

interface PlatformVoiceDesignVoice {
  id: string;
  name: string;
  status: string;
  statusName: string;
  providerVoiceId: string | null;
  previewAudioUrl: string | null;
  description: string | null;
  createdAt: string;
}

interface PlatformVoiceDesignModel {
  id: string;
  displayName: string;
  modelName: string;
  providerDisplayName: string;
  isAvailable: boolean;
}

interface PromptPreset {
  name: string;
  prompt: string;
  tone: string;
}

interface PlatformVoiceDesignConsoleProps {
  action: PlatformVoiceDesignAction;
  created: boolean;
  error?: string;
  initialVoiceId?: string;
  models: PlatformVoiceDesignModel[];
  voices: PlatformVoiceDesignVoice[];
}

const promptPresets: PromptPreset[] = [
  {
    name: "年迈智者",
    tone: "沉稳、低缓、有阅历的中文男声，像耐心讲故事的长者。",
    prompt: "一位年迈而睿智的中文男声，声音低沉温和，语速舒缓，适合讲述历史故事和人生经验。"
  },
  {
    name: "激情解说",
    tone: "高能、清晰、节奏快",
    prompt: "一位充满激情的体育赛事解说员，声音明亮有爆发力，语速偏快，情绪饱满但吐字清晰。"
  },
  {
    name: "悬疑故事家",
    tone: "低声、神秘、有张力",
    prompt: "一位擅长悬疑故事叙述的男声，声线低沉，语气克制，节奏有停顿感，能营造紧张氛围。"
  },
  {
    name: "摇篮曲女声",
    tone: "轻柔、亲切、慢速",
    prompt: "一位温柔的年轻女声，声音轻软亲切，语速缓慢，适合讲睡前故事和安抚型内容。"
  },
  {
    name: "严厉女教师",
    tone: "清晰、有力、偏美式英语",
    prompt: "一位亲切的中学女英语教师，声音清晰有力，语速适中，低调的美式英语发音。"
  }
];

const previewTexts = [
  "今天我们来讲讲美国第一任总统华盛顿。首先看第一句。Washington remains an important figure in the American imagination. Even today people tell stories about him.",
  "同学们请注意这一段里的关键词。我们先听完整句子，再拆解它的语法和语气。",
  "欢迎来到学乐 AI。接下来这段声音将用于检查音色的清晰度、稳定性和情绪表达。"
];

const platformVoiceDesignDraftKey = "xueleai:admin:platform-voice-design-draft";

export function PlatformVoiceDesignConsole({
  action,
  created,
  error,
  initialVoiceId,
  models,
  voices
}: PlatformVoiceDesignConsoleProps) {
  const initialPreset = promptPresets[promptPresets.length - 1];
  const [prompt, setPrompt] = useState(initialPreset.prompt);
  const [previewText, setPreviewText] = useState(previewTexts[0]);
  const [voiceName, setVoiceName] = useState(initialPreset.name);
  const [selectedVoiceId, setSelectedVoiceId] = useState(initialVoiceId ?? voices[0]?.id ?? "");
  const [playingVoiceId, setPlayingVoiceId] = useState("");
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const displayVoices = useMemo(() => voices.slice(0, 3), [voices]);
  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId);
  const defaultModelId =
    models.find((model) => model.isAvailable && model.modelName === "cosyvoice-v3.5-plus")?.id ??
    models.find((model) => model.isAvailable && model.modelName.startsWith("cosyvoice"))?.id ??
    models.find((model) => model.isAvailable)?.id ??
    models[0]?.id;

  useEffect(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(platformVoiceDesignDraftKey) ?? "null") as unknown;

      if (!draft || typeof draft !== "object") {
        return;
      }

      const values = draft as Record<string, unknown>;
      setPrompt(typeof values.prompt === "string" ? values.prompt : initialPreset.prompt);
      setPreviewText(typeof values.previewText === "string" ? values.previewText : previewTexts[0]);
      setVoiceName(typeof values.voiceName === "string" ? values.voiceName : initialPreset.name);
    } catch {
      sessionStorage.removeItem(platformVoiceDesignDraftKey);
    }
  }, [initialPreset.name, initialPreset.prompt]);

  function preserveDraft() {
    sessionStorage.setItem(
      platformVoiceDesignDraftKey,
      JSON.stringify({
        prompt,
        previewText,
        voiceName
      })
    );
  }

  function applyPreset(preset: PromptPreset) {
    setPrompt(preset.prompt);
    setVoiceName(preset.name);
  }

  function randomPreviewText() {
    const currentIndex = previewTexts.indexOf(previewText);
    const nextText = previewTexts[(currentIndex + 1) % previewTexts.length];
    setPreviewText(nextText);
  }

  function clearPreviewText() {
    setPreviewText("");
  }

  function togglePlay(voice: PlatformVoiceDesignVoice) {
    const current = audioRefs.current[voice.id];

    if (!current) {
      return;
    }

    for (const [id, audio] of Object.entries(audioRefs.current)) {
      if (id !== voice.id) {
        audio?.pause();
      }
    }

    if (playingVoiceId === voice.id) {
      current.pause();
      setPlayingVoiceId("");
      return;
    }

    void current.play();
    setPlayingVoiceId(voice.id);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-14">
      {created ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800">
          平台音色已生成，可以试听后确认选择。
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-5 py-3 text-sm font-medium text-destructive">
          {error}
        </div>
      ) : null}

      <form action={action} className="flex flex-col gap-14" onSubmit={preserveDraft}>
        <input name="name" type="hidden" value={voiceName} />
        <input name="language" type="hidden" value="zh-CN" />
        <input name="modelAlias" type="hidden" value="voice-design-default" />

        <section className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-normal">提示词</h2>
            {models.length > 0 ? (
              <label className="flex items-center gap-3 text-base font-semibold">
                设计模型
                <select
                  className="h-12 min-w-72 rounded-full border border-border bg-background px-5 text-base font-semibold outline-none transition hover:bg-secondary focus:border-foreground"
                  defaultValue={defaultModelId}
                  name="modelInstanceId"
                  required
                >
                  {models.map((model) => (
                    <option disabled={!model.isAvailable} key={model.id} value={model.id}>
                      {model.providerDisplayName} · {model.displayName} · {model.modelName}
                      {model.isAvailable ? "" : "（未启用）"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-[28px] border border-border bg-card">
            <Textarea
              className="min-h-[190px] resize-none border-0 bg-transparent px-7 py-6 text-xl leading-10 shadow-none hover:border-0 focus:border-0 focus:ring-0 md:text-xl"
              maxLength={500}
              name="prompt"
              onChange={(event) => setPrompt(event.target.value)}
              value={prompt}
            />
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-4">
              <button
                aria-label="切换提示词示例"
                className="flex size-12 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:bg-secondary"
                type="button"
                onClick={() => {
                  const index = promptPresets.findIndex((preset) => preset.name === voiceName);
                  applyPreset(promptPresets[(index + 1) % promptPresets.length]);
                }}
              >
                <Shuffle className="size-5" />
              </button>
              {promptPresets.map((preset) => (
                <button
                  className={cn(
                    "inline-flex h-12 items-center gap-3 rounded-full border border-border bg-background px-4 text-base font-semibold transition hover:border-primary/40 hover:bg-secondary",
                    voiceName === preset.name ? "border-foreground bg-secondary" : null
                  )}
                  key={preset.name}
                  title={preset.tone}
                  type="button"
                  onClick={() => applyPreset(preset)}
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                    {preset.name.slice(0, 1)}
                  </span>
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-normal">试听文本</h2>
            <Button className="bg-background text-foreground hover:bg-secondary" type="button" variant="outline" onClick={randomPreviewText}>
              <Sparkles data-icon="inline-start" />
              自动生成
            </Button>
          </div>
          <div className="rounded-[24px] border border-border bg-card px-7 py-5">
            <Textarea
              className="min-h-[128px] resize-none border-0 bg-transparent px-0 py-0 text-xl leading-9 shadow-none hover:border-0 focus:border-0 focus:ring-0 md:text-xl"
              maxLength={300}
              name="previewText"
              onChange={(event) => setPreviewText(event.target.value)}
              value={previewText}
            />
            <div className="flex flex-wrap items-center gap-4 pt-5 text-base text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>{previewText.length} / 300 字符</span>
                <button aria-label="清空试听文本" className="transition hover:text-foreground" type="button" onClick={clearPreviewText}>
                  <Eraser className="size-5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-end">
          <GenerateButton />
        </div>
      </form>

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold tracking-normal">生成音色结果</h2>
        {displayVoices.length > 0 ? (
          <div className="grid gap-5 xl:grid-cols-3">
            {displayVoices.map((voice, index) => {
              const selected = selectedVoiceId === voice.id;
              const playing = playingVoiceId === voice.id;

              return (
                <div
                  className={cn(
                    "flex h-24 items-center justify-between gap-4 rounded-2xl bg-secondary/70 px-6 text-left transition hover:bg-secondary",
                    selected ? "bg-muted shadow-sm" : null
                  )}
                  key={voice.id}
                >
                  <button
                    aria-label={playing ? `暂停${voice.name}` : `播放${voice.name}`}
                    className={cn(
                      "flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background",
                      !voice.previewAudioUrl ? "opacity-50" : null
                    )}
                    disabled={!voice.previewAudioUrl}
                    type="button"
                    onClick={() => togglePlay(voice)}
                  >
                    {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
                  </button>
                  {voice.previewAudioUrl ? (
                    <audio
                      onEnded={() => setPlayingVoiceId("")}
                      ref={(element) => {
                        audioRefs.current[voice.id] = element;
                      }}
                      src={voice.previewAudioUrl}
                    >
                      <track kind="captions" />
                    </audio>
                  ) : null}
                  <button className="min-w-0 flex-1 text-left" type="button" onClick={() => setSelectedVoiceId(voice.id)}>
                    <span className="block truncate text-xl font-semibold">音色 {index + 1}</span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">{voice.name} · {voice.statusName}</span>
                  </button>
                  <button aria-label={`选择${voice.name}`} className="shrink-0" type="button" onClick={() => setSelectedVoiceId(voice.id)}>
                    {selected ? <CheckCircle2 className="size-7 fill-foreground text-background" /> : <Circle className="size-7 text-muted-foreground" />}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
            暂无生成结果。
          </div>
        )}
        <div className="flex justify-end">
          <Button asChild className="h-16 min-w-60 bg-[#7357ff] px-10 text-lg text-white shadow-lg shadow-[#7357ff]/20 hover:bg-[#6548f2]">
            <Link aria-disabled={!selectedVoice} href={selectedVoice ? `/admin/audio/voices/${selectedVoice.id}` : "/admin/audio/voices/platform-design"}>
              确认选择
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function GenerateButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="h-16 min-w-60 bg-[#7357ff] px-10 text-lg text-white shadow-lg shadow-[#7357ff]/20 hover:bg-[#6548f2]" disabled={pending} type="submit">
      <Sparkles data-icon="inline-start" />
      {pending ? "生成中" : "重新生成"}
    </Button>
  );
}
