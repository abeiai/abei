"use client";

import Link from "next/link";
import { useState } from "react";
import { Filter, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  adminVoiceAccentsByLanguage,
  adminVoiceLanguages,
  normalizeAdminVoiceAccent,
  normalizeAdminVoiceLanguage
} from "@/lib/voice-classification";

interface AdminVoiceListFiltersProps {
  query: {
    accent?: string;
    keyword?: string;
    language?: string;
    model?: string;
    status?: string;
  };
}

const allAccents = [...new Set(Object.values(adminVoiceAccentsByLanguage).flat())];
const modelOptions = ["cosyvoice-v3-flash", "cosyvoice-v3-plus", "speech-2.8-turbo", "speech-2.8-hd"];

export function AdminVoiceListFilters({ query }: AdminVoiceListFiltersProps) {
  const [language, setLanguage] = useState(() => normalizeAdminVoiceLanguage(query.language));
  const [accent, setAccent] = useState(() => normalizeAdminVoiceAccent(query.accent));
  const accentOptions = language ? adminVoiceAccentsByLanguage[language] ?? [] : allAccents;

  return (
    <form
      className="grid gap-3 rounded-md border border-border bg-secondary/30 p-4 md:grid-cols-2 xl:grid-cols-[1.2fr_repeat(4,minmax(0,0.8fr))_auto_auto]"
      method="get"
    >
      <Field>
        <FieldLabel htmlFor="keyword">搜索</FieldLabel>
        <Input defaultValue={query.keyword ?? ""} id="keyword" name="keyword" placeholder="名称、voice 参数、特质、场景" />
      </Field>
      <Field>
        <FieldLabel htmlFor="status">状态</FieldLabel>
        <Select defaultValue={query.status ?? ""} id="status" name="status">
          <option value="">全部状态</option>
          <option value="READY">可用</option>
          <option value="DISABLED">已禁用</option>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="language">语种</FieldLabel>
        <Select
          id="language"
          name="language"
          onChange={(event) => {
            const nextLanguage = event.target.value;
            const nextAccents = nextLanguage ? adminVoiceAccentsByLanguage[nextLanguage] ?? [] : allAccents;
            setLanguage(nextLanguage);
            setAccent((current) => (nextAccents.includes(current) ? current : ""));
          }}
          value={language}
        >
          <option value="">全部语种</option>
          {adminVoiceLanguages.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="accent">口音</FieldLabel>
        <Select
          disabled={accentOptions.length === 0}
          id="accent"
          name="accent"
          onChange={(event) => setAccent(event.target.value)}
          value={accentOptions.includes(accent) ? accent : ""}
        >
          <option value="">全部口音</option>
          {accentOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="model">模型</FieldLabel>
        <Select defaultValue={query.model ?? ""} id="model" name="model">
          <option value="">全部模型</option>
          {modelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex items-end">
        <Button className="w-full" type="submit">
          <Filter data-icon="inline-start" />
          筛选
        </Button>
      </div>
      <div className="flex items-end">
        <Button asChild className="w-full" variant="outline">
          <Link href="/admin/audio/voices">
            <RotateCcw data-icon="inline-start" />
            重置
          </Link>
        </Button>
      </div>
    </form>
  );
}
