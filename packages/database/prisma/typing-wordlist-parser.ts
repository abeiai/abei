import { createHash } from "node:crypto";

export type ParsedTypingItemType = "WORD" | "PHRASE";

export interface ParsedTypingWordlistItem {
  britishPhonetic: string | null;
  isSpellingRequired: boolean;
  itemType: ParsedTypingItemType;
  normalizedText: string;
  partOfSpeech: string | null;
  sourceOrder: number;
  sourcePage: number;
  sourceRaw: string;
  text: string;
  translation: string | null;
}

export interface ParsedTypingWordlistUnit {
  code: string;
  items: ParsedTypingWordlistItem[];
  number: number;
  sourcePageEnd: number | null;
  sourcePageStart: number | null;
  title: string;
}

export interface ParsedTypingWordlist {
  sourceHash: string;
  units: ParsedTypingWordlistUnit[];
}

export interface TypingWordlistCorrectionItem {
  isSpellingRequired?: boolean;
  sourcePage?: number;
  text: string;
  translation: string;
}

export interface TypingWordlistCorrections {
  append?: readonly {
    items: readonly TypingWordlistCorrectionItem[];
    unitNumber: number;
  }[];
  replacements?: readonly {
    items: readonly TypingWordlistCorrectionItem[];
    sourceOrder: number;
    unitNumber: number;
  }[];
}

const unitHeadingPattern = /^###\s+Unit\s+(\d+)\s*$/gmu;
const pageEntryPattern = /([\s\S]*?)[(（]\s*(\d{1,3})\s*[)）]/gu;
const hanPattern = /\p{Script=Han}/u;
const partOfSpeechContinuationPattern = /^(?:(?:linking|modal)\s+v\.|abbr\.|pron\.|prep\.|conj\.|det\.|adj\.|adv\.|vt\.|vi\.|n\.|num\.)/iu;
const partOfSpeechSuffixPattern = /\s*((?:(?:linking|modal)\s+v\.|abbr\.|pron\.|prep\.|conj\.|det\.|adj\.|adv\.|vt\.|vi\.|n\.|num\.)(?:\s*[,&.]\s*(?:(?:linking|modal)\s+v\.|abbr\.|pron\.|prep\.|conj\.|det\.|adj\.|adv\.|vt\.|vi\.|n\.|num\.))*)$/iu;

export function normalizeTypingAnswer(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[‘’]/gu, "'")
    .replace(/[‐‑–—]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-GB");
}

export function parseTypingWordlist(markdown: string): ParsedTypingWordlist {
  const section = wordlistByUnitSection(markdown);
  const headingMatches = [...section.matchAll(unitHeadingPattern)];
  const units = headingMatches.map((match, index) => {
    const number = Number(match[1]);
    const start = (match.index ?? 0) + match[0].length;
    const end = headingMatches[index + 1]?.index ?? section.length;
    const body = cleanUnitMarkdown(section.slice(start, end));
    const items = parseUnitEntries(body);
    const pages = items.map((item) => item.sourcePage);

    return {
      code: `unit-${String(number).padStart(2, "0")}`,
      items,
      number,
      sourcePageEnd: pages.length > 0 ? Math.max(...pages) : null,
      sourcePageStart: pages.length > 0 ? Math.min(...pages) : null,
      title: `Unit ${number}`
    } satisfies ParsedTypingWordlistUnit;
  });

  return {
    sourceHash: createHash("sha256").update(markdown).digest("hex"),
    units
  };
}

export function parseTypingAlphabeticalWordlist(
  markdown: string,
  unitStartPages: readonly number[]
): ParsedTypingWordlist {
  if (unitStartPages.length === 0 || unitStartPages.some((page, index) => (
    !Number.isInteger(page)
    || page <= 0
    || (index > 0 && page <= (unitStartPages[index - 1] ?? 0))
  ))) {
    throw new Error("单元起始页必须是严格递增的正整数");
  }

  const section = cleanAlphabeticalMarkdown(alphabeticalWordlistSection(markdown));
  const parsedItems = parseUnitEntries(section);
  const groupedItems = unitStartPages.map(() => [] as ParsedTypingWordlistItem[]);

  for (const item of parsedItems) {
    const unitIndex = findUnitIndex(item.sourcePage, unitStartPages);

    if (unitIndex < 0) {
      throw new Error(`第 ${item.sourcePage} 页词汇早于首个单元起始页`);
    }

    groupedItems[unitIndex]?.push({
      ...item,
      sourceOrder: (groupedItems[unitIndex]?.length ?? 0) + 1
    });
  }

  return {
    sourceHash: createHash("sha256").update(markdown).digest("hex"),
    units: groupedItems.map((items, index) => ({
      code: `unit-${String(index + 1).padStart(2, "0")}`,
      items,
      number: index + 1,
      sourcePageEnd: items.length > 0 ? Math.max(...items.map((item) => item.sourcePage)) : null,
      sourcePageStart: items.length > 0 ? Math.min(...items.map((item) => item.sourcePage)) : null,
      title: `Unit ${index + 1}`
    }))
  };
}

export function parseTypingPrimaryWordlist(
  markdown: string,
  options: {
    insertUnitBefore?: readonly string[];
  } = {}
): ParsedTypingWordlist {
  const lines = decodeBasicHtmlEntities(markdown).split(/\r?\n/u);
  const byUnitExplanationIndex = findLastLineIndex(lines, (line) => line.includes("按单元顺序收录"));
  const wordListsIndex = findLastLineIndex(lines, (line) => /^###\s+Word lists\s*$/iu.test(line.trim()));
  const startIndex = Math.max(byUnitExplanationIndex, wordListsIndex);

  if (startIndex < 0) {
    throw new Error("教材 Markdown 中未找到小学按单元编排的词汇表");
  }

  const insertUnitBefore = new Set(options.insertUnitBefore ?? []);
  const units: ParsedTypingWordlistUnit[] = [];
  let currentPage = 0;
  let currentUnit: ParsedTypingWordlistUnit | null = null;
  let pendingEnglish: string | null = null;

  const startUnit = () => {
    currentUnit = {
      code: `unit-${String(units.length + 1).padStart(2, "0")}`,
      items: [],
      number: units.length + 1,
      sourcePageEnd: null,
      sourcePageStart: null,
      title: `Unit ${units.length + 1}`
    };
    units.push(currentUnit);
    pendingEnglish = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const pageMatch = rawLine.match(/^##\s+第\s*(\d+)\s*页\s*$/u);
    if (pageMatch) {
      currentPage = Number(pageMatch[1]);
    }
    if (index <= startIndex) {
      continue;
    }

    const line = rawLine.trim();
    if (
      line.includes("按字母顺序收录")
      || line.includes("括号中的数字为该词条在本册书中首次出现时的单元数")
    ) {
      break;
    }
    if (/^###\s+(?:J?Unit)\s*\d+\b/iu.test(line)) {
      startUnit();
      continue;
    }
    if (insertUnitBefore.has(line)) {
      startUnit();
    }
    if (!currentUnit || shouldSkipPrimaryWordlistLine(line)) {
      continue;
    }

    const translationIndex = translationStartIndex(line);
    const beginsWithTranslation = translationIndex === 0;
    if (beginsWithTranslation) {
      if (pendingEnglish) {
        appendPrimaryItem(currentUnit, pendingEnglish, line, currentPage);
        pendingEnglish = null;
      }
      continue;
    }
    if (translationIndex > 0) {
      if (pendingEnglish) {
        appendPrimaryItem(currentUnit, pendingEnglish, null, currentPage);
      }
      appendPrimaryItem(
        currentUnit,
        line.slice(0, translationIndex).trim(),
        line.slice(translationIndex).trim(),
        currentPage
      );
      pendingEnglish = null;
      continue;
    }
    if (!line.includes("=")) {
      pendingEnglish = line;
    }
  }

  return {
    sourceHash: createHash("sha256").update(markdown).digest("hex"),
    units
  };
}

export function parseTypingPrimaryAlphabeticalWordlist(
  markdown: string,
  unitStartPages: readonly number[]
): ParsedTypingWordlist {
  const marker = "按字母顺序收录";
  const start = markdown.lastIndexOf(marker);
  if (start < 0) {
    throw new Error("教材 Markdown 中未找到小学按字母编排的词汇表");
  }

  const markerLineEnd = markdown.indexOf("\n", start + marker.length);
  const bodyStart = markerLineEnd < 0 ? markdown.length : markerLineEnd + 1;
  const remainder = markdown.slice(bodyStart);
  const properNouns = remainder.match(/^###\s+III\s*$|^说明：本表收录各单元出现的专有名词/mu);
  const end = properNouns?.index === undefined ? markdown.length : bodyStart + properNouns.index;
  const parsedItems = parseUnitEntries(cleanAlphabeticalMarkdown(markdown.slice(bodyStart, end)));
  const groupedItems = unitStartPages.map(() => [] as ParsedTypingWordlistItem[]);

  for (const item of parsedItems) {
    const unitIndex = findUnitIndex(item.sourcePage, unitStartPages);
    if (unitIndex < 0) {
      throw new Error(`第 ${item.sourcePage} 页词汇早于首个单元起始页`);
    }
    groupedItems[unitIndex]?.push({
      ...item,
      sourceOrder: (groupedItems[unitIndex]?.length ?? 0) + 1
    });
  }

  return {
    sourceHash: createHash("sha256").update(markdown).digest("hex"),
    units: groupedItems.map((items, index) => ({
      code: `unit-${String(index + 1).padStart(2, "0")}`,
      items,
      number: index + 1,
      sourcePageEnd: items.length > 0 ? Math.max(...items.map((item) => item.sourcePage)) : null,
      sourcePageStart: items.length > 0 ? Math.min(...items.map((item) => item.sourcePage)) : null,
      title: `Unit ${index + 1}`
    }))
  };
}

export function applyTypingWordlistCorrections(
  parsed: ParsedTypingWordlist,
  corrections: TypingWordlistCorrections
): ParsedTypingWordlist {
  const replacements = new Map<string, readonly TypingWordlistCorrectionItem[]>();

  for (const replacement of corrections.replacements ?? []) {
    const key = `${replacement.unitNumber}:${replacement.sourceOrder}`;
    if (replacements.has(key)) {
      throw new Error(`词表修正重复指定 Unit ${replacement.unitNumber} 第 ${replacement.sourceOrder} 条`);
    }
    replacements.set(key, replacement.items);
  }

  const appendByUnit = new Map<number, readonly TypingWordlistCorrectionItem[]>();
  for (const append of corrections.append ?? []) {
    if (appendByUnit.has(append.unitNumber)) {
      throw new Error(`词表修正重复追加 Unit ${append.unitNumber}`);
    }
    appendByUnit.set(append.unitNumber, append.items);
  }

  const units = parsed.units.map((unit) => {
    const correctedItems = unit.items.flatMap((item) => {
      const key = `${unit.number}:${item.sourceOrder}`;
      const replacement = replacements.get(key);
      if (replacement === undefined) {
        return [item];
      }
      replacements.delete(key);
      return replacement.map((entry) => correctionItemToParsed(entry, item.sourcePage, item.sourceOrder));
    });
    const appended = appendByUnit.get(unit.number) ?? [];
    appendByUnit.delete(unit.number);
    const fallbackPage = unit.sourcePageEnd ?? unit.sourcePageStart ?? 0;
    correctedItems.push(...appended.map((entry) => (
      correctionItemToParsed(entry, fallbackPage, correctedItems.length + 1)
    )));
    const items = correctedItems.map((item, index) => ({
      ...item,
      sourceOrder: index + 1
    }));
    const pages = items.map((item) => item.sourcePage).filter((page) => page > 0);

    return {
      ...unit,
      items,
      sourcePageEnd: pages.length > 0 ? Math.max(...pages) : null,
      sourcePageStart: pages.length > 0 ? Math.min(...pages) : null
    };
  });

  if (replacements.size > 0 || appendByUnit.size > 0) {
    throw new Error(`词表修正引用了不存在的单元或来源顺序：${[
      ...replacements.keys(),
      ...[...appendByUnit.keys()].map((unitNumber) => `Unit ${unitNumber}`)
    ].join("、")}`);
  }

  return {
    sourceHash: parsed.sourceHash,
    units
  };
}

function correctionItemToParsed(
  entry: TypingWordlistCorrectionItem,
  fallbackPage: number,
  sourceOrder: number
): ParsedTypingWordlistItem {
  const text = normalizeEnglishText(entry.text);
  return {
    britishPhonetic: null,
    isSpellingRequired: entry.isSpellingRequired !== false,
    itemType: /\s/u.test(text) ? "PHRASE" : "WORD",
    normalizedText: normalizeTypingAnswer(text),
    partOfSpeech: null,
    sourceOrder,
    sourcePage: entry.sourcePage ?? fallbackPage,
    sourceRaw: `${entry.isSpellingRequired === false ? "*" : ""}${text} ${entry.translation}`,
    text,
    translation: entry.translation
  };
}

function appendPrimaryItem(
  unit: ParsedTypingWordlistUnit,
  english: string,
  translation: string | null,
  sourcePage: number
) {
  const pageMatch = translation?.match(/^(.*?)[（(]\s*(\d{1,3})\s*[)）]\s*$/u);
  const normalizedTranslation = pageMatch ? pageMatch[1]?.trim() ?? null : translation;
  const itemPage = pageMatch ? Number(pageMatch[2]) : sourcePage;
  const sourceRaw = [english, normalizedTranslation].filter(Boolean).join(" ");
  unit.items.push(parseEntry(sourceRaw, itemPage, unit.items.length + 1));
  unit.sourcePageStart = unit.sourcePageStart === null ? itemPage : Math.min(unit.sourcePageStart, itemPage);
  unit.sourcePageEnd = unit.sourcePageEnd === null ? itemPage : Math.max(unit.sourcePageEnd, itemPage);
}

function shouldSkipPrimaryWordlistLine(line: string) {
  return !line
    || /^!\[/u.test(line)
    || /^---$/u.test(line)
    || /^#{1,6}\s/u.test(line)
    || /^[（(]\s*\d+\s*[)）]$/u.test(line);
}

function findLastLineIndex(lines: readonly string[], predicate: (line: string) => boolean) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (predicate(lines[index] ?? "")) {
      return index;
    }
  }
  return -1;
}

function wordlistByUnitSection(markdown: string) {
  const startMatch = markdown.match(/^#{2,3}\s+Wordlist(?:\s+1)?\s*\(by unit\)\s*$/imu);
  const start = startMatch?.index ?? -1;

  if (start < 0) {
    throw new Error("教材 Markdown 中未找到按单元编排的词汇表");
  }

  const bodyStart = start + (startMatch?.[0].length ?? 0);
  const endMatch = markdown.slice(bodyStart)
    .match(/^#{2,3}\s+Wordlist(?:\s+2)?\s*\(in alphabetical order\)\s*$/imu);
  const end = endMatch?.index === undefined ? -1 : bodyStart + endMatch.index;

  if (end < 0) {
    throw new Error("教材 Markdown 中未找到按字母编排的词汇表边界");
  }

  return markdown.slice(bodyStart, end);
}

function alphabeticalWordlistSection(markdown: string) {
  const startMatch = markdown.match(
    /^#{2,3}\s+Wordlist(?:\s+2)?\s*\(in alphabetical order\)\s*$/imu
  );
  const start = startMatch?.index ?? -1;

  if (start < 0) {
    throw new Error("教材 Markdown 中未找到按字母编排的词汇表");
  }

  const markerEnd = start + (startMatch?.[0].length ?? 0);
  const remainder = markdown.slice(markerEnd);
  const firstLetterHeading = remainder.match(/^###\s+A\s*$/mu);
  const bodyStart = firstLetterHeading?.index === undefined
    ? markerEnd
    : markerEnd + firstLetterHeading.index + firstLetterHeading[0].length;
  const properNounsMatch = markdown.slice(bodyStart).match(
    /^#{2,3}\s+(?:Wordlist\s+3\s*\()?Proper nouns\)?\b.*$/imu
  );
  const end = properNounsMatch?.index === undefined
    ? markdown.length
    : bodyStart + properNounsMatch.index;

  return markdown.slice(bodyStart, end);
}

function cleanUnitMarkdown(markdown: string) {
  return decodeBasicHtmlEntities(markdown)
    .replace(/^!\[[^\]]*\]\([^\n]*\)\s*$/gmu, " ")
    .replace(/^---\s*$/gmu, " ")
    .replace(/^##\s+第\s*\d+\s*页\s*$/gmu, " ")
    .replace(/([（(]\s*\d{1,3})\s*(?=[*A-Za-z‘'])/gu, "$1) ");
}

function cleanAlphabeticalMarkdown(markdown: string) {
  return cleanUnitMarkdown(markdown)
    .replace(/^#{1,6}\s+[A-Z]\s*$/gmu, " ");
}

function findUnitIndex(sourcePage: number, unitStartPages: readonly number[]) {
  for (let index = unitStartPages.length - 1; index >= 0; index -= 1) {
    if (sourcePage >= (unitStartPages[index] ?? Number.POSITIVE_INFINITY)) {
      return index;
    }
  }

  return -1;
}

function parseUnitEntries(body: string) {
  const items: ParsedTypingWordlistItem[] = [];

  for (const match of body.matchAll(pageEntryPattern)) {
    let sourceRaw = normalizeSourceRaw(match[1] ?? "");

    if (!sourceRaw) {
      continue;
    }

    const fusedContinuation = sourceRaw.match(/^(\p{Script=Han}[\s\S]*?)\s+(\*?[A-Za-z][\s\S]*)$/u);
    if (fusedContinuation) {
      const previous = items.at(-1);
      if (!previous) {
        throw new Error(`第 ${match[2]} 页的中文续行前缺少词汇`);
      }

      const continuation = fusedContinuation[1]?.trim() ?? "";
      previous.sourceRaw = `${previous.sourceRaw} ${continuation}`;
      previous.translation = [previous.translation, continuation].filter(Boolean).join("；");
      sourceRaw = normalizeSourceRaw(fusedContinuation[2] ?? "");
    }

    if (
      partOfSpeechContinuationPattern.test(sourceRaw)
      || (!/[A-Za-z]/u.test(sourceRaw) && hanPattern.test(sourceRaw))
    ) {
      const previous = items.at(-1);

      if (!previous) {
        throw new Error(`第 ${match[2]} 页的词性续行前缺少词汇`);
      }

      previous.sourceRaw = `${previous.sourceRaw} ${sourceRaw}`;
      previous.translation = [previous.translation, sourceRaw].filter(Boolean).join("；");
      continue;
    }

    items.push(parseEntry(sourceRaw, Number(match[2]), items.length + 1));
  }

  return items;
}

function parseEntry(sourceRaw: string, sourcePage: number, sourceOrder: number): ParsedTypingWordlistItem {
  const isSpellingRequired = !sourceRaw.startsWith("*");
  const body = sourceRaw.replace(/^\*+/u, "").replace(/^[‘’'"）)]+/u, "").trim();
  const firstSlash = body.indexOf("/");
  const secondSlash = firstSlash >= 0 ? body.indexOf("/", firstSlash + 1) : -1;
  let britishPhonetic: string | null = null;
  let partOfSpeech: string | null = null;
  let text: string;
  let translation: string | null = null;

  if (firstSlash > 0 && secondSlash > firstSlash) {
    text = body.slice(0, firstSlash).trim();
    britishPhonetic = emptyToNull(body.slice(firstSlash + 1, secondSlash));
    const remainder = body.slice(secondSlash + 1).trim();
    const translationIndex = translationStartIndex(remainder);

    if (translationIndex >= 0) {
      partOfSpeech = emptyToNull(normalizePartOfSpeech(remainder.slice(0, translationIndex)));
      translation = emptyToNull(remainder.slice(translationIndex));
    } else {
      partOfSpeech = emptyToNull(normalizePartOfSpeech(remainder));
    }
  } else {
    const translationIndex = translationStartIndex(body);
    const englishAndPartOfSpeech = translationIndex >= 0 ? body.slice(0, translationIndex).trim() : body;
    const partOfSpeechMatch = englishAndPartOfSpeech.match(partOfSpeechSuffixPattern);

    if (partOfSpeechMatch?.index !== undefined) {
      text = englishAndPartOfSpeech.slice(0, partOfSpeechMatch.index).trim();
      partOfSpeech = normalizePartOfSpeech(partOfSpeechMatch[1]);
    } else {
      text = englishAndPartOfSpeech;
    }

    translation = translationIndex >= 0 ? emptyToNull(body.slice(translationIndex)) : null;
  }

  text = normalizeEnglishText(text).replace(/\ba setof\b/giu, "a set of");

  const leadingWordInPartOfSpeech = partOfSpeech?.match(/^([A-Za-z-]+)\s+((?:n|vt|vi|adj|adv|pron|prep|conj|det)\.)$/iu);
  if (leadingWordInPartOfSpeech) {
    text = `${text} ${leadingWordInPartOfSpeech[1]}`;
    partOfSpeech = leadingWordInPartOfSpeech[2];
  }

  const missingOpeningPhoneticSlash = text.match(/^([A-Za-z-]+)\s+([^/\s]+)\/$/u);
  if (!britishPhonetic && missingOpeningPhoneticSlash) {
    text = missingOpeningPhoneticSlash[1] ?? text;
    britishPhonetic = missingOpeningPhoneticSlash[2] ?? null;
  }

  if (!text) {
    throw new Error(`第 ${sourcePage} 页第 ${sourceOrder} 条词汇缺少英文内容`);
  }

  return {
    britishPhonetic,
    isSpellingRequired,
    itemType: /\s/u.test(text) ? "PHRASE" : "WORD",
    normalizedText: normalizeTypingAnswer(text),
    partOfSpeech,
    sourceOrder,
    sourcePage,
    sourceRaw,
    text,
    translation
  };
}

function normalizeEnglishText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[‘’]/gu, "'")
    .replace(/α/gu, "a")
    .replace(/\bIhelp\b/gu, "I help")
    .replace(/\bWelldone\b/giu, "Well done")
    .replace(/\bWhata\b/giu, "What a")
    .replace(/\s*\.{2,3}\s*/gu, " ... ")
    .replace(/\.{3}\s+([,.;:!?])/gu, "...$1")
    .replace(/[·•]+\s*$/u, "")
    .replace(/\s*:\s*$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizePartOfSpeech(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .replace(/\s*&\s*/gu, " & ")
    .trim();
}

function normalizeSourceRaw(value: string) {
  return value
    .replace(/（/gu, "(")
    .replace(/）/gu, ")")
    .replace(/．/gu, ".")
    .replace(/^[\s)）]+/u, "")
    .replace(/\s+/gu, " ")
    .replace(/^###\s+译林出版社\s*/u, "")
    .replace(/^###\s+\d+\s*/u, "")
    .replace(/^\d+\s+(?=\*)/u, "")
    .replace(/^[“”"]+\s*/u, "")
    .replace(/^=\s*<美>\s*(?:one-on-one|cut in|program|traveling|license|mail|jewelry|humor|percent)\s+/iu, "")
    .replace(/^\p{Script=Han}+\s+(?=[A-Za-z])/u, "")
    .replace(/^0r\b/u, "or")
    .replace(/^\/(?:nkri:s|nkriis)\//iu, "increase /ɪn'kri:s/")
    .replace(/^\/(?:ri'kəid|rɪ'kɔ:d)\//iu, "record /rɪ'kɔ:d/")
    .replace(/^BBQ\s+abbr\.\s*\(=\s*barbecue\s+(\/[^/]+\/)[)）]\s*/iu, "BBQ $1 abbr. ")
    .replace(/\b(?:had better|would rather)\s*\(='d (?:better|rather)\)/giu, (match) => match.slice(0, match.indexOf("(")))
    .replace(/\bn\.\s*\(=MV\)(?=\p{Script=Han})/giu, "n. ")
    .trim();
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&")
    .replace(/&nbsp;/gu, " ");
}

function translationStartIndex(value: string) {
  const hanIndex = value.search(hanPattern);

  if (hanIndex <= 0) {
    return hanIndex;
  }

  return /[(（<]/u.test(value[hanIndex - 1] ?? "") ? hanIndex - 1 : hanIndex;
}

function emptyToNull(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}
