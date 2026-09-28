"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Heart, Play, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  filterVoicePickerOptions,
  legacyVoiceFavoriteKey,
  legacyVoiceRecentKey,
  mergeStoredVoiceValues,
  parseStoredVoiceValues,
  resolveVoiceAvatar,
  toggleStoredVoiceValue,
  voicePickerAccents,
  voicePickerFavoriteKey,
  voicePickerLanguages,
  voicePickerRecentKey,
  type VoicePickerOption
} from "@/lib/voice-picker";
import { cn } from "@/lib/utils";

interface VoicePickerProps {
  disabled?: boolean;
  label?: string;
  onChange: (value: string) => void;
  value: string;
  voices: VoicePickerOption[];
}

type VoicePickerTab = "library" | "mine" | "favorite";

export function VoicePicker({ disabled = false, label = "语音", onChange, value, voices }: VoicePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedVoice = voices.find((voice) => voice.value === value) ?? voices[0];
  const unavailable = disabled || voices.length === 0;

  return (
    <div className="flex flex-col gap-2">
      {label ? <p className="text-sm font-semibold">{label}</p> : null}
      <button
        className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-input bg-card px-4 py-3 text-left outline-none transition-colors hover:bg-secondary focus:border-foreground focus:ring-[3px] focus:ring-ring/10 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={unavailable}
        onClick={() => setOpen(true)}
        type="button"
      >
        {selectedVoice ? <VoiceAvatar className="size-8" voice={selectedVoice} /> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{selectedVoice?.name ?? "请选择音色"}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {selectedVoice?.badge ?? "暂无可用音色"}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <VoicePickerDialog
          onChange={(nextValue) => {
            onChange(nextValue);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          value={value}
          voices={voices}
        />
      ) : null}
    </div>
  );
}

function VoicePickerDialog({
  onChange,
  onClose,
  value,
  voices
}: {
  onChange: (value: string) => void;
  onClose: () => void;
  value: string;
  voices: VoicePickerOption[];
}) {
  const [tab, setTab] = useState<VoicePickerTab>("library");
  const [keyword, setKeyword] = useState("");
  const [language, setLanguage] = useState("all");
  const [accent, setAccent] = useState("all");
  const [gender, setGender] = useState("all");
  const [age, setAge] = useState("all");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [supportFilters, setSupportFilters] = useState({ ssml: false, instruct: false, timestamp: false });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [recentValues, setRecentValues] = useState<string[]>([]);
  const [favoriteValues, setFavoriteValues] = useState<string[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const languageOptions = useMemo(() => uniqueValues(voices.flatMap(voicePickerLanguages)), [voices]);
  const accentOptions = useMemo(
    () => language === "all" ? [] : uniqueValues(voices.flatMap((voice) => voicePickerAccents(voice, language))),
    [language, voices]
  );
  const ageOptions = useMemo(() => uniqueValues(voices.map((voice) => voice.ageCategory)), [voices]);
  const tagOptions = useMemo(() => uniqueValues(voices.flatMap(voiceTags)).slice(0, 24), [voices]);
  const filteredVoices = useMemo(() => {
    const base =
      tab === "mine"
        ? voices.filter(isUserVoice)
        : tab === "favorite"
          ? mergeStoredVoiceValues(favoriteValues, recentValues, 50)
              .map((storedValue) => voices.find((voice) => voice.value === storedValue))
              .filter((voice): voice is VoicePickerOption => Boolean(voice))
          : voices;

    return filterVoicePickerOptions(base, {
      keyword,
      language: language === "all" ? "" : language,
      accent: accent === "all" ? "" : accent,
      gender: gender === "all" ? "" : gender,
      age: age === "all" ? "" : age,
      tags: selectedTags,
      ...supportFilters
    });
  }, [accent, age, favoriteValues, gender, keyword, language, recentValues, selectedTags, supportFilters, tab, voices]);

  useEffect(() => {
    const recent = mergeStoredVoiceValues(
      parseStoredVoiceValues(window.localStorage.getItem(voicePickerRecentKey), 50),
      parseStoredVoiceValues(window.localStorage.getItem(legacyVoiceRecentKey), 50),
      50
    );
    const favorites = mergeStoredVoiceValues(
      parseStoredVoiceValues(window.localStorage.getItem(voicePickerFavoriteKey), 50),
      parseStoredVoiceValues(window.localStorage.getItem(legacyVoiceFavoriteKey), 50),
      50
    );
    setRecentValues(recent);
    setFavoriteValues(favorites);
    window.localStorage.setItem(voicePickerRecentKey, JSON.stringify(recent));
    window.localStorage.setItem(voicePickerFavoriteKey, JSON.stringify(favorites));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previewAudioRef.current?.pause();
    };
  }, [onClose]);

  function pickVoice(nextValue: string) {
    const nextRecent = mergeStoredVoiceValues([nextValue], recentValues, 5);
    setRecentValues(nextRecent);
    window.localStorage.setItem(voicePickerRecentKey, JSON.stringify(nextRecent));
    onChange(nextValue);
  }

  function toggleFavorite(nextValue: string) {
    const nextFavorites = toggleStoredVoiceValue(favoriteValues, nextValue, 50);
    setFavoriteValues(nextFavorites);
    window.localStorage.setItem(voicePickerFavoriteKey, JSON.stringify(nextFavorites));
  }

  function playPreview(url: string | null | undefined) {
    previewAudioRef.current?.pause();
    if (previewAudioRef.current) previewAudioRef.current.currentTime = 0;
    if (!url) return;
    const audio = new Audio(url);
    previewAudioRef.current = audio;
    void audio.play();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="flex max-h-[86vh] w-full max-w-5xl flex-col rounded-2xl border border-border bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">音色选择</h2>
            <p className="mt-1 text-sm text-muted-foreground">选择适合当前内容的合成音色。</p>
          </div>
          <Button aria-label="关闭音色选择" className="size-10 px-0" onClick={onClose} type="button" variant="ghost">
            <X className="size-5" />
          </Button>
        </div>
        <div className="flex shrink-0 flex-col gap-4 border-b border-border px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {([
              ["library", "音色库"],
              ["mine", "我的音色"],
              ["favorite", "收藏音色"]
            ] as const).map(([tabValue, tabLabel]) => (
              <button
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium",
                  tab === tabValue ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                )}
                key={tabValue}
                onClick={() => setTab(tabValue)}
                type="button"
              >
                {tabLabel}
              </button>
            ))}
          </div>
          <div className="grid gap-2 lg:grid-cols-[minmax(180px,1fr)_120px_120px_110px_110px_110px]">
            <input
              className="h-10 rounded-full border border-input bg-background px-4 text-sm outline-none focus:border-foreground"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索音色名称、标签或描述"
              value={keyword}
            />
            <FilterSelect
              label="按语种"
              onChange={(nextLanguage) => {
                setLanguage(nextLanguage);
                setAccent("all");
              }}
              options={languageOptions}
              value={language}
            />
            <FilterSelect
              disabled={language === "all" || accentOptions.length === 0}
              label="按口音"
              onChange={setAccent}
              options={accentOptions}
              value={accent}
            />
            <FilterSelect label="按性别" onChange={setGender} options={["女声", "男声"]} value={gender} />
            <FilterSelect label="按年龄" onChange={setAge} options={ageOptions} value={age} />
            <div className="relative">
              <Button className="w-full" onClick={() => setTagPickerOpen((current) => !current)} type="button" variant="outline">
                按标签
              </Button>
              {tagPickerOpen ? (
                <div className="absolute right-0 top-12 z-10 w-80 max-w-[calc(100vw-3rem)] rounded-2xl border border-border bg-card p-4 shadow-xl">
                  <div className="grid gap-2 text-sm">
                    <CheckboxFilter checked={supportFilters.ssml} label="支持 SSML" onChange={(checked) => setSupportFilters((current) => ({ ...current, ssml: checked }))} />
                    <CheckboxFilter checked={supportFilters.instruct} label="支持 Instruct" onChange={(checked) => setSupportFilters((current) => ({ ...current, instruct: checked }))} />
                    <CheckboxFilter checked={supportFilters.timestamp} label="支持时间戳" onChange={(checked) => setSupportFilters((current) => ({ ...current, timestamp: checked }))} />
                  </div>
                  <div className="mt-4 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                    {tagOptions.map((tag) => {
                      const active = selectedTags.includes(tag);
                      return (
                        <button
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs",
                            active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                          )}
                          key={tag}
                          onClick={() => setSelectedTags((current) => active ? current.filter((item) => item !== tag) : [...current, tag])}
                          type="button"
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="flex flex-col gap-3 pt-4">
            {filteredVoices.map((voice) => {
              const selected = voice.value === value;
              const favorited = favoriteValues.includes(voice.value);
              return (
                <div
                  className={cn(
                    "flex flex-col gap-4 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center",
                    selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-secondary"
                  )}
                  key={voice.value}
                >
                  <VoiceAvatar className="size-12" voice={voice} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{voice.name}</span>
                    <span className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {voice.description ?? voice.badge}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button aria-label={`试听${voice.name}`} disabled={!voice.previewAudioUrl} onClick={() => playPreview(voice.previewAudioUrl)} size="sm" type="button" variant="outline">
                      <Play className="size-4" />
                      试听
                    </Button>
                    <Button aria-label={favorited ? `取消收藏${voice.name}` : `收藏${voice.name}`} className="size-9 px-0" onClick={() => toggleFavorite(voice.value)} size="sm" type="button" variant={favorited ? "default" : "outline"}>
                      <Heart className={cn("size-4", favorited && "fill-current")} />
                    </Button>
                    <Button onClick={() => pickVoice(voice.value)} size="sm" type="button" variant={selected ? "default" : "outline"}>
                      {selected ? "已选" : "选择"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {filteredVoices.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
                没有符合条件的音色。
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function VoiceAvatar({ className, voice }: { className: string; voice: VoicePickerOption }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={cn("shrink-0 rounded-full object-cover", className)}
      height={48}
      src={resolveVoiceAvatar(voice)}
      width={48}
    />
  );
}

function FilterSelect({ disabled = false, label, onChange, options, value }: { disabled?: boolean; label: string; onChange: (value: string) => void; options: string[]; value: string }) {
  return (
    <Select className="h-10 rounded-full" disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="all">{label}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </Select>
  );
}

function CheckboxFilter({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function voiceTags(voice: VoicePickerOption): string[] {
  return uniqueValues([voice.badge, voice.trait, voice.scene, voice.ageCategory, ...(voice.languages ?? []), voice.language]);
}

function isUserVoice(voice: VoicePickerOption): boolean {
  return voice.value.startsWith("voice:") && !voice.badge.startsWith("平台");
}
