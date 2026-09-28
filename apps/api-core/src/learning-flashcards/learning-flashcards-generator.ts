export type FlashcardStrategy = "SUBJECT_KNOWLEDGE" | "SCIENCE_POPULARIZATION" | "DAILY_MEMORY";

export interface FlashcardGenerationInput {
  title: string;
  sourceText: string;
  strategy: FlashcardStrategy;
  detailRequest?: string;
  cardTypes: string[];
  targetCardCount: number;
}

export interface GeneratedKnowledgeNode {
  title: string;
  description: string;
  priority: number;
}

export interface GeneratedFlashcard {
  type: string;
  front: string;
  back: string;
  source: string;
  tags: string[];
}

export interface GeneratedFlashcardDeck {
  title: string;
  summary: string;
  knowledgeMap: GeneratedKnowledgeNode[];
  cards: GeneratedFlashcard[];
}

export function parseGeneratedFlashcardDeck(text: string, fallbackInput: FlashcardGenerationInput): GeneratedFlashcardDeck {
  const parsed = parseJsonObject(text);

  if (!parsed) {
    return buildFallbackFlashcardDeck(fallbackInput);
  }

  const knowledgeMap = normalizeKnowledgeMap(parsed.knowledgeMap);
  const cards = normalizeCards(parsed.cards);

  if (cards.length === 0) {
    return buildFallbackFlashcardDeck(fallbackInput);
  }

  return {
    title: normalizeString(parsed.title) || fallbackInput.title,
    summary: normalizeString(parsed.summary) || summaryForInput(fallbackInput),
    knowledgeMap: knowledgeMap.length > 0 ? knowledgeMap : fallbackKnowledgeMap(fallbackInput),
    cards
  };
}

export function buildFallbackFlashcardDeck(input: FlashcardGenerationInput): GeneratedFlashcardDeck {
  const keywords = extractKeywords(input.sourceText).slice(0, Math.max(1, Math.min(input.targetCardCount, 12)));
  const cards = keywords.map((keyword, index) => ({
    type: cardTypeName(input.cardTypes[index % Math.max(1, input.cardTypes.length)]),
    front: keyword,
    back: fallbackBack(keyword, input),
    source: input.title,
    tags: fallbackTags(input)
  }));

  return {
    title: input.title,
    summary: summaryForInput(input),
    knowledgeMap: fallbackKnowledgeMap(input),
    cards: cards.length > 0
      ? cards
      : [
          {
            type: "记忆卡",
            front: input.title,
            back: input.detailRequest?.trim() || "请根据材料内容进行主动回忆。",
            source: input.title,
            tags: fallbackTags(input)
          }
        ]
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  const candidates = [trimmed, extractFirstJsonObject(trimmed)].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);

      return isRecord(parsed) ? parsed : null;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  return start >= 0 && end > start ? text.slice(start, end + 1) : "";
}

function normalizeKnowledgeMap(value: unknown): GeneratedKnowledgeNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const title = normalizeString(item.title);
      const description = normalizeString(item.description ?? item.desc);

      if (!title) {
        return null;
      }

      return {
        title,
        description,
        priority: clampInteger(item.priority, 1, 100, 50)
      };
    })
    .filter((item): item is GeneratedKnowledgeNode => Boolean(item));
}

function normalizeCards(value: unknown): GeneratedFlashcard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const front = normalizeString(item.front);
      const back = normalizeString(item.back);

      if (!front || !back) {
        return null;
      }

      return {
        type: normalizeString(item.type) || "记忆卡",
        front,
        back,
        source: normalizeString(item.source) || "学习材料",
        tags: normalizeTags(item.tags)
      };
    })
    .filter((item): item is GeneratedFlashcard => Boolean(item));
}

function extractKeywords(text: string) {
  const normalized = text
    .replace(/[，。！？；：、（）【】《》“”]/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  const tokens = normalized.match(/[A-Za-z][A-Za-z0-9' -]{1,40}|[\u4e00-\u9fa5]{2,12}/g) ?? [];
  const seen = new Set<string>();

  return tokens
    .map((token) => token.trim())
    .filter((token) => {
      const key = token.toLowerCase();

      if (key.length < 2 || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function fallbackBack(keyword: string, input: FlashcardGenerationInput) {
  const detail = input.detailRequest?.trim();

  return detail ? `${keyword}：围绕「${detail}」进行记忆和复习。` : `${keyword}：根据材料内容进行主动回忆，并说出含义或用途。`;
}

function fallbackKnowledgeMap(input: FlashcardGenerationInput): GeneratedKnowledgeNode[] {
  return [
    {
      title: input.title,
      description: input.detailRequest?.trim() || strategyName(input.strategy),
      priority: 80
    }
  ];
}

function fallbackTags(input: FlashcardGenerationInput) {
  return [strategyName(input.strategy), ...(input.detailRequest?.trim() ? [input.detailRequest.trim()] : [])].slice(0, 4);
}

function summaryForInput(input: FlashcardGenerationInput) {
  return `${input.title} · ${strategyName(input.strategy)} · ${Math.max(1, input.targetCardCount)} 张以内`;
}

function cardTypeName(value: string | undefined) {
  const names: Record<string, string> = {
    meaning: "词义卡",
    spelling: "拼写卡",
    example: "语境例句卡",
    grammar: "语法规则卡",
    compare: "辨析卡",
    listening: "听力卡"
  };

  return value ? names[value] ?? "记忆卡" : "记忆卡";
}

function strategyName(value: FlashcardStrategy) {
  const names: Record<FlashcardStrategy, string> = {
    SUBJECT_KNOWLEDGE: "学科知识",
    SCIENCE_POPULARIZATION: "科普材料",
    DAILY_MEMORY: "日常记忆"
  };

  return names[value];
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeString(item)).filter(Boolean).slice(0, 8);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
