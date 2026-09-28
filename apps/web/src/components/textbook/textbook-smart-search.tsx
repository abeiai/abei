"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicTextbookFilterOption, PublicTextbookListItem, PublicTextbookListResult } from "@/lib/textbook-public-api";
import { textbookPath, textbookTypeRoutes, type TextbookRouteFilters } from "@/lib/textbook-seo";

interface TextbookSmartSearchProps {
  filters: PublicTextbookListResult["filters"];
  initialQuery?: string;
  samples: PublicTextbookListItem[];
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

export function TextbookSmartSearch({ filters, initialQuery = "", samples }: TextbookSmartSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const parsed = useMemo(() => parseTextbookQuery(query, filters), [filters, query]);
  const hasParsedFilters = Object.values(parsed).some(Boolean);
  const href = hasParsedFilters || !query.trim() ? textbookPath(parsed) : `/textbook?q=${encodeURIComponent(query.trim())}`;
  const matchingSamples = useMemo(() => matchSamples(query, parsed, samples), [parsed, query, samples]);

  return (
    <div className="textbook-smart-search">
      <form
        className="textbook-smart-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          router.push(href);
        }}
      >
        <div className="textbook-smart-input-wrap">
          <Search className="size-5" />
          <Input
            aria-label="搜索教材"
            className="textbook-smart-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入教材，例如：三年级数学人教版"
            value={query}
          />
        </div>
        <Button className="textbook-smart-submit" type="submit">
          找教材
          <ArrowRight data-icon="inline-end" />
        </Button>
      </form>

      {matchingSamples.length > 0 ? (
        <div className="textbook-live-matches">
          {matchingSamples.map((textbook) => (
            <Link className="textbook-live-match" href={`/textbook/${textbook.slug}`} key={textbook.id}>
              <span className="truncate font-bold">{textbook.title}</span>
              <span>{textbook.grade} · {textbook.subject}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
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
  const educationType = detectEducationType(normalizedQuery, grade);

  return {
    educationType: educationType || undefined,
    grade: grade || undefined,
    subject: subject || undefined,
    version: version || undefined
  };
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

function matchSamples(query: string, filters: TextbookRouteFilters, samples: PublicTextbookListItem[]) {
  const normalizedQuery = normalize(query);

  return samples
    .filter((textbook) => {
      const exactMatch =
        (!filters.educationType || textbook.educationType === filters.educationType) &&
        (!filters.grade || textbook.grade === filters.grade) &&
        (!filters.subject || textbook.subject === filters.subject) &&
        (!filters.version || textbook.version === filters.version);

      if (exactMatch && Object.keys(filters).length > 0) {
        return true;
      }

      return normalizedQuery.length >= 2 && normalize(textbook.title).includes(normalizedQuery);
    })
    .slice(0, 3);
}

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
