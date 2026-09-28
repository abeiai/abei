"use client";

import { useState } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import {
  adminVoiceAccentsByLanguage,
  adminVoiceLanguages,
  normalizeAdminVoiceAccent,
  normalizeAdminVoiceAgeCategory,
  normalizeAdminVoiceLanguage
} from "@/lib/voice-classification";

interface AdminVoiceClassificationFieldsProps {
  accent?: string | null;
  ageCategory?: string | null;
  gender?: string | null;
  idPrefix: string;
  language?: string | null;
}

export function AdminVoiceClassificationFields({
  accent: initialAccent,
  ageCategory,
  gender,
  idPrefix,
  language: initialLanguage
}: AdminVoiceClassificationFieldsProps) {
  const [language, setLanguage] = useState(() => normalizeAdminVoiceLanguage(initialLanguage));
  const [accent, setAccent] = useState(() => normalizeAdminVoiceAccent(initialAccent));
  const accentOptions = adminVoiceAccentsByLanguage[language] ?? [];
  const languageOptions = adminVoiceLanguages.includes(language as (typeof adminVoiceLanguages)[number])
    ? adminVoiceLanguages
    : language
      ? [language, ...adminVoiceLanguages]
      : adminVoiceLanguages;

  return (
    <div className="contents">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-language`}>语种</FieldLabel>
        <Select
          id={`${idPrefix}-language`}
          name="language"
          onChange={(event) => {
            const nextLanguage = event.target.value;
            const nextAccents = adminVoiceAccentsByLanguage[nextLanguage] ?? [];
            setLanguage(nextLanguage);
            setAccent((current) => (nextAccents.includes(current) ? current : ""));
          }}
          required
          value={language}
        >
          <option disabled value="">
            请选择语种
          </option>
          {languageOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-accent`}>口音</FieldLabel>
        <Select
          disabled={accentOptions.length === 0}
          id={`${idPrefix}-accent`}
          name="accent"
          onChange={(event) => setAccent(event.target.value)}
          value={accentOptions.includes(accent) ? accent : ""}
        >
          <option value="">无特定口音</option>
          {accentOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-gender`}>性别</FieldLabel>
        <Select defaultValue={gender === "女声" ? "女声" : "男声"} id={`${idPrefix}-gender`} name="gender">
          <option value="男声">男声</option>
          <option value="女声">女声</option>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-age-category`}>年龄分类</FieldLabel>
        <Select
          defaultValue={normalizeAdminVoiceAgeCategory(ageCategory)}
          id={`${idPrefix}-age-category`}
          name="ageCategory"
        >
          <option value="儿童">儿童</option>
          <option value="青年">青年</option>
          <option value="中年">中年</option>
          <option value="老年">老年</option>
        </Select>
      </Field>
    </div>
  );
}
