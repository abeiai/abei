import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import { getPrismaClient, type DictionaryEntry, type PrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";

interface DictionarySearchQuery {
  q?: string;
  limit?: string;
}

type DictionaryClient = Pick<PrismaClient, "dictionaryEntry">;
type DictionaryQueryMode = "word" | "translation";

const dictionaryClientToken = Symbol("DICTIONARY_CLIENT");
const maxSearchLimit = 20;
const defaultSearchLimit = 8;
const exchangeLabels: Record<string, string> = {
  p: "过去式",
  d: "过去分词",
  i: "现在分词",
  "3": "第三人称单数",
  r: "比较级",
  t: "最高级",
  s: "复数",
  "0": "原形",
  "1": "变形"
};

@Injectable()
export class DictionaryService {
  constructor(
    @Optional()
    @Inject(dictionaryClientToken)
    private readonly prisma: DictionaryClient = getPrismaClient()
  ) {}

  async search(query: DictionarySearchQuery) {
    const rawQuery = String(query.q ?? "").trim();

    if (!rawQuery) {
      throw new AppException(40001, "请输入要查询的英文单词或中文释义", HttpStatus.BAD_REQUEST);
    }

    const queryMode = detectDictionaryQueryMode(rawQuery);

    if (!queryMode) {
      throw new AppException(40001, "只能查询英文单词、短语或中文释义", HttpStatus.BAD_REQUEST);
    }

    const normalizedQuery = normalizeDictionaryQuery(rawQuery, queryMode);
    const limit = normalizeSearchLimit(query.limit);
    const [totalEntries, exact, suggestions] = await Promise.all([
      this.prisma.dictionaryEntry.count(),
      queryMode === "word"
        ? this.prisma.dictionaryEntry.findFirst({
            where: {
              normalizedWord: normalizedQuery
            },
            orderBy: dictionaryOrderBy()
          })
        : Promise.resolve(null),
      this.prisma.dictionaryEntry.findMany({
        where: dictionarySearchWhere(normalizedQuery, queryMode),
        orderBy: dictionaryOrderBy(),
        take: limit
      })
    ]);

    return {
      query: rawQuery,
      normalizedQuery,
      queryMode,
      totalEntries,
      exact: exact ? formatDictionaryEntry(exact) : null,
      suggestions: suggestions.map(formatDictionaryEntry),
      source: {
        name: "ECDICT",
        repositoryUrl: "https://github.com/skywind3000/ecdict"
      }
    };
  }
}

function normalizeDictionaryQuery(value: string, mode: DictionaryQueryMode) {
  const trimmed = value.trim();

  return mode === "word" ? trimmed.toLowerCase() : trimmed;
}

function normalizeSearchLimit(value: string | undefined) {
  const limit = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(limit)) {
    return defaultSearchLimit;
  }

  return Math.min(Math.max(limit, 1), maxSearchLimit);
}

function detectDictionaryQueryMode(value: string): DictionaryQueryMode | null {
  if (isSafeEnglishDictionaryQuery(value)) {
    return "word";
  }

  if (isSafeChineseDictionaryQuery(value)) {
    return "translation";
  }

  return null;
}

function isSafeEnglishDictionaryQuery(value: string) {
  return /^[a-zA-Z][a-zA-Z0-9\s'.-]{0,80}$/.test(value);
}

function isSafeChineseDictionaryQuery(value: string) {
  const trimmed = value.trim();
  const hasControlCharacters = Array.from(trimmed).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;

    return codePoint < 32 || codePoint === 127;
  });

  return (
    trimmed.length <= 80 &&
    /[\p{Script=Han}]/u.test(trimmed) &&
    !hasControlCharacters &&
    !trimmed.includes("%") &&
    !trimmed.includes("_")
  );
}

function dictionarySearchWhere(query: string, mode: DictionaryQueryMode) {
  if (mode === "translation") {
    return {
      translation: {
        contains: query
      }
    };
  }

  return {
    normalizedWord: {
      startsWith: query
    }
  };
}

function dictionaryOrderBy() {
  return [
    {
      collins: {
        sort: "desc" as const,
        nulls: "last" as const
      }
    },
    {
      frequency: {
        sort: "asc" as const,
        nulls: "last" as const
      }
    },
    {
      bnc: {
        sort: "asc" as const,
        nulls: "last" as const
      }
    },
    {
      word: "asc" as const
    }
  ];
}

function formatDictionaryEntry(entry: DictionaryEntry) {
  return {
    id: entry.id,
    word: entry.word,
    phonetic: entry.phonetic,
    definition: entry.definition,
    definitionLines: splitLines(entry.definition),
    translation: entry.translation,
    translationLines: splitLines(entry.translation),
    partOfSpeech: entry.partOfSpeech,
    collins: entry.collins,
    oxford: entry.oxford,
    tags: splitTags(entry.tag),
    bnc: entry.bnc,
    frequency: entry.frequency,
    exchanges: parseExchange(entry.exchange),
    detail: entry.detail,
    audio: entry.audio
  };
}

function splitLines(value: string | null) {
  return String(value ?? "")
    .replace(/\\n/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitTags(value: string | null) {
  return String(value ?? "")
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseExchange(value: string | null) {
  return String(value ?? "")
    .split("/")
    .map((item) => {
      const separatorIndex = item.indexOf(":");

      if (separatorIndex <= 0) {
        return null;
      }

      const key = item.slice(0, separatorIndex);
      const exchangeValue = item.slice(separatorIndex + 1).trim();

      if (!exchangeValue) {
        return null;
      }

      return {
        label: exchangeLabels[key] ?? key,
        value: exchangeValue
      };
    })
    .filter((item): item is { label: string; value: string } => Boolean(item));
}
