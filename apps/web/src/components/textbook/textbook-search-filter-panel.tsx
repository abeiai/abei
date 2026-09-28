"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, RotateCcw, Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PublicTextbookFilterOption, PublicTextbookListResult } from "@/lib/textbook-public-api";
import { textbookPath, textbookTypeRoutes, type TextbookRouteFilters } from "@/lib/textbook-seo";

interface TextbookSearchFilterPanelProps {
  current?: TextbookRouteFilters;
  filters: PublicTextbookListResult["filters"];
  total: number;
}

const gradeAliases = [
  ["小一", "一年级"],
  ["小二", "二年级"],
  ["小三", "三年级"],
  ["小四", "四年级"],
  ["小五", "五年级"],
  ["小六", "六年级"],
  ["初一", "七年级"],
  ["初二", "八年级"],
  ["初三", "九年级"]
] as const;

export function TextbookSearchFilterPanel({
  current = {},
  filters
}: TextbookSearchFilterPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState(current.q ?? "");
  const [educationType, setEducationType] = useState(current.educationType ?? "");
  const [grade, setGrade] = useState(current.grade ?? "");
  const [subject, setSubject] = useState(current.subject ?? "");
  const [version, setVersion] = useState(current.version ?? "");
  const [volume, setVolume] = useState(current.volume ?? "");
  const parsed = useMemo(() => parseTextbookQuery(query, filters), [filters, query]);
  const effectiveSubject = subject || parsed.subject;
  const versionOptions = useMemo(() => versionsForSubject(filters, effectiveSubject), [effectiveSubject, filters]);
  const manualVersion = optionValueAvailable(version, versionOptions) ? version : "";
  const parsedVersion = optionValueAvailable(parsed.version, versionOptions) ? parsed.version : "";
  const manualFilters = { educationType, grade, subject, version: manualVersion, volume };
  const hasManualFilters = Object.values(manualFilters).some(Boolean);
  const hasParsedFilters = Object.values(parsed).some(Boolean);
  const nextFilters = useMemo(
    () =>
      compactFilters({
        educationType: educationType || parsed.educationType,
        grade: grade || parsed.grade,
        q: shouldKeepKeyword(query, hasManualFilters, hasParsedFilters) ? query.trim().slice(0, 80) : undefined,
        subject: subject || parsed.subject,
        version: manualVersion || parsedVersion,
        volume: volume || parsed.volume
      }),
    [educationType, grade, hasManualFilters, hasParsedFilters, manualVersion, parsed, parsedVersion, query, subject, volume]
  );
  const href = textbookPath(nextFilters);

  return (
    <div className="textbook-smart-search textbook-command-search">
      <form
        className="textbook-unified-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          router.push(href);
        }}
      >
        <div className="textbook-filter-form textbook-unified-filter-form">
          <FilterSelect
            label="学科"
            onChange={(value) => {
              setSubject(value);

              if (version && !optionValueAvailable(version, versionsForSubject(filters, value))) {
                setVersion("");
              }
            }}
            options={filters.subjects}
            placeholder="全部学科"
            value={subject}
          />
          <FilterSelect
            label="版本"
            onChange={setVersion}
            options={versionOptions}
            placeholder="全部版本"
            value={manualVersion}
          />
          <FilterSelect
            label="学段"
            onChange={setEducationType}
            options={filters.educationTypes}
            placeholder="全部学段"
            value={educationType}
          />
          <FilterSelect
            label="年级"
            onChange={setGrade}
            options={filters.grades}
            placeholder="全部年级"
            value={grade}
          />
          <FilterSelect
            label="册数"
            onChange={setVolume}
            options={filters.volumes}
            placeholder="全部册数"
            value={volume}
          />
          <div className="textbook-filter-actions">
            <Button className="w-full" type="submit">
              <SlidersHorizontal data-icon="inline-start" />
              筛选
            </Button>
            <Button className="w-full" onClick={() => router.push("/textbook")} type="button" variant="outline">
              <RotateCcw data-icon="inline-start" />
              重置
            </Button>
          </div>
          <div className="textbook-smart-input-wrap textbook-command-input textbook-filter-search-input">
            <Search className="size-5" />
            <Input
              aria-label="搜索教材"
              className="textbook-smart-input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入教材，例如：三年级数学人教版上册"
              value={query}
            />
          </div>
          <Button className="textbook-smart-submit textbook-command-submit textbook-filter-search-submit" type="submit">
            查找教材
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  placeholder,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  value: string;
}) {
  return (
    <Field className="textbook-filter-field">
      <Select
        aria-label={label}
        className="textbook-filter-select"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function parseTextbookQuery(query: string, filters: PublicTextbookListResult["filters"]): TextbookRouteFilters {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return {};
  }

  const grade = detectGrade(normalizedQuery, filters.grades);
  const subject = detectOption(normalizedQuery, filters.subjects);
  const version = detectVersion(normalizedQuery, filters.versions);
  const volume = detectOption(normalizedQuery, filters.volumes);
  const educationType = detectEducationType(normalizedQuery, grade);

  return {
    educationType: educationType || undefined,
    grade: grade || undefined,
    subject: subject || undefined,
    version: version || undefined,
    volume: volume || undefined
  };
}

function shouldKeepKeyword(query: string, hasManualFilters: boolean, hasParsedFilters: boolean) {
  const keyword = query.trim();

  if (!keyword) {
    return false;
  }

  return hasManualFilters || !hasParsedFilters;
}

function versionsForSubject(filters: PublicTextbookListResult["filters"], subject?: string) {
  if (!subject) {
    return filters.versions;
  }

  if (!filters.versionsBySubject) {
    return filters.versions;
  }

  return filters.versionsBySubject[subject] ?? [];
}

function optionValueAvailable(value: string | undefined, options: PublicTextbookFilterOption[]) {
  return Boolean(value && options.some((option) => option.value === value));
}

function compactFilters(filters: TextbookRouteFilters): TextbookRouteFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => (typeof value === "string" ? value.trim() : Boolean(value)))
  ) as TextbookRouteFilters;
}

function detectEducationType(query: string, grade?: string) {
  const explicitType = [...textbookTypeRoutes]
    .sort((first, second) => second.label.length - first.label.length)
    .find((item) => query.includes(normalize(item.label)))?.value;

  if (explicitType) {
    return explicitType;
  }

  if (grade && ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"].includes(grade)) {
    return "PRIMARY";
  }

  if (grade && ["七年级", "八年级", "九年级"].includes(grade)) {
    return "JUNIOR";
  }

  if (grade && ["高一", "高二", "高三"].includes(grade)) {
    return "SENIOR";
  }

  return "";
}

function detectGrade(query: string, grades: PublicTextbookFilterOption[]) {
  const alias = gradeAliases.find(([keyword]) => query.includes(normalize(keyword)));

  if (alias && grades.some((item) => item.value === alias[1])) {
    return alias[1];
  }

  return detectOption(query, grades);
}

function detectVersion(query: string, versions: PublicTextbookFilterOption[]) {
  const directMatch = detectOption(query, versions);

  if (directMatch) {
    return directMatch;
  }

  const fuzzyVersion = versions.find((item) => {
    const value = normalize(item.value.replace(/[（(].*?[）)]/g, ""));

    return value.length >= 2 && query.includes(value);
  });

  return fuzzyVersion?.value ?? "";
}

function detectOption(query: string, options: PublicTextbookFilterOption[]) {
  const sortedOptions = [...options].sort((first, second) => second.value.length - first.value.length);
  const match = sortedOptions.find((option) => {
    const value = normalize(option.value);
    const label = normalize(option.label);

    return Boolean(value && (query.includes(value) || value.includes(query) || query.includes(label)));
  });

  return match?.value ?? "";
}

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
