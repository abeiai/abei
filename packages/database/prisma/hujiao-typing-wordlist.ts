import { createHash } from "node:crypto";

import {
  normalizeTypingAnswer,
  type ParsedTypingWordlist,
  type ParsedTypingWordlistItem,
  type ParsedTypingWordlistUnit
} from "./typing-wordlist-parser.js";

interface SourceLine {
  line: string;
  page: number;
}

const hanPattern = /\p{Script=Han}/u;
const pageSuffixPattern = /\bp\s*\.\s*(\d{1,3})(?=\s|[A-Za-z*#]|$)/giu;
const unitPattern = /^(?:#{1,6}\s*)?Unit\s*(\d+)\b\s*(.*)$/iu;

export function parseHujiaoPrimaryDirectWordlist(
  markdown: string,
  expectedUnitCount: number
): ParsedTypingWordlist {
  const lines = sourceLines(markdown);
  const start = findLastUnitOne(lines);
  const units = emptyUnits(expectedUnitCount);
  let currentUnit = 0;

  for (let index = start; index < lines.length; index += 1) {
    const source = lines[index]!;
    if (isDirectSectionEnd(source.line)) {
      break;
    }
    const marker = cleanLine(source.line).match(unitPattern);
    if (marker) {
      const number = Number(marker[1]);
      if (number >= 1 && number <= expectedUnitCount) {
        currentUnit = number;
        const remainder = marker[2]?.trim() ?? "";
        if (remainder && hanPattern.test(remainder)) {
          appendDirectSegments(units[number - 1]!, remainder, source.page);
        }
      }
      continue;
    }
    if (currentUnit === 0 || shouldSkipLine(source.line)) {
      continue;
    }

    const line = cleanLine(source.line);
    if (!line) {
      continue;
    }
    if (!/[A-Za-zα]/u.test(line) && hanPattern.test(line)) {
      appendTranslationContinuation(units[currentUnit - 1]!, line);
      continue;
    }
    appendDirectSegments(units[currentUnit - 1]!, line, source.page);
  }

  return parsedResult(markdown, units);
}

export function parseHujiaoPrimaryIndexedWordlist(
  markdown: string,
  expectedUnitCount: number
): ParsedTypingWordlist {
  const lines = sourceLines(markdown);
  const start = findLastLine(lines, (entry) => /Word\s+list\s*2\s*\(in alphabetical order\)/iu.test(entry.line));
  if (start < 0) {
    throw new Error("沪教版小学教材中未找到按字母编排的词汇表");
  }

  const units = emptyUnits(expectedUnitCount);
  const alphabeticStarts = lines
    .map((entry, index) => ({ index, line: entry.line.trim() }))
    .filter((entry) => entry.index >= Math.max(0, start - 250)
      && entry.index <= start + 30
      && /^###\s+A(?:\s+A)?\s*$/iu.test(entry.line))
    .map((entry) => entry.index);
  const sectionStart = Math.min(start, ...alphabeticStarts);
  let pending = "";

  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    const source = lines[index]!;
    if (/^#{1,6}\s+(?:Proper nouns|Days of the week)\b/iu.test(source.line.trim())) {
      break;
    }
    if (shouldSkipLine(source.line)) {
      continue;
    }
    const cells = source.line.includes("|")
      ? source.line.split("|").map((cell) => cell.trim()).filter(Boolean)
      : [source.line.trim()];

    for (const cell of cells) {
      if (isAlphabeticHeading(cell) || /Word\s+list\s*2/iu.test(cell)) {
        continue;
      }
      pending = `${pending} ${cell}`
        .replace(/U(\d{1,2})(?=[A-Za-zα])/gu, "U$1 ")
        .replace(/\s+/gu, " ")
        .trim();
      const extracted = indexedEntriesFromBuffer(pending);
      pending = extracted.remainder;
      for (const entry of extracted.entries) {
        if (entry.unit < 1 || entry.unit > expectedUnitCount) {
          throw new Error(`沪教版小学词条单元编号超出范围：${entry.unit}`);
        }
        const unit = units[entry.unit - 1]!;
        if (!hasSameItem(unit, entry.english, entry.translation)) {
          appendItem(unit, entry.english, entry.translation, source.page);
        }
      }
    }
  }

  deduplicateUnits(units);
  return parsedResult(markdown, units);
}

export function reassignHujiaoWordlistByPage(
  parsed: ParsedTypingWordlist,
  unitStartPages: readonly number[]
): ParsedTypingWordlist {
  if (unitStartPages.length === 0 || unitStartPages.some((page, index) => (
    !Number.isInteger(page)
    || page <= 0
    || (index > 0 && page <= unitStartPages[index - 1]!)
  ))) {
    throw new Error("沪教版单元起始页必须为严格递增的正整数");
  }
  const units = emptyUnits(unitStartPages.length);
  for (const item of parsed.units.flatMap((unit) => unit.items)) {
    const unitIndex = findPageUnit(item.sourcePage, unitStartPages);
    if (unitIndex < 0) {
      throw new Error(`沪教版第 ${item.sourcePage} 页词汇早于首个单元起始页`);
    }
    units[unitIndex]!.items.push({ ...item });
  }
  deduplicateUnits(units);
  return { sourceHash: parsed.sourceHash, units };
}

export function parseHujiaoPageWordlist(
  markdown: string,
  expectedUnitCount: number
): ParsedTypingWordlist {
  const lines = sourceLines(markdown);
  const alphabeticalEnd = findLastLine(lines, (entry) => /\bin alphabetical order\b/iu.test(entry.line));
  const searchEnd = alphabeticalEnd >= 0 ? alphabeticalEnd : lines.length;
  const lastUnitOne = findLastLineBefore(lines, searchEnd, (entry) => {
    const marker = cleanLine(entry.line).match(unitPattern);
    return Number(marker?.[1]) === 1;
  });
  const sectionHeading = findLastLineBefore(
    lines,
    searchEnd,
    (entry) => /\bin each unit\b/iu.test(entry.line)
  );
  const start = Math.max(lastUnitOne, sectionHeading);
  if (start < 0) {
    throw new Error("沪教版教材中未找到按单元编排的页码词汇表");
  }

  const units = emptyUnits(expectedUnitCount);
  let currentUnit = 0;
  let pending = "";

  const flush = (unit: ParsedTypingWordlistUnit) => {
    for (const match of pending.matchAll(pageSuffixPattern)) {
      const end = match.index! + match[0].length;
      const previousEnd = Number((match as RegExpMatchArray & { previousEnd?: number }).previousEnd ?? 0);
      void previousEnd;
      const before = pending.slice(0, end);
      const priorMarkers = [...before.matchAll(pageSuffixPattern)];
      const prior = priorMarkers.at(-2);
      const startIndex = prior ? prior.index! + prior[0].length : 0;
      const raw = pending.slice(startIndex, match.index).trim();
      if (raw) {
        appendPageItem(unit, raw, Number(match[1]));
      }
    }
    const last = [...pending.matchAll(pageSuffixPattern)].at(-1);
    pending = last ? pending.slice(last.index! + last[0].length).trim() : pending;
  };

  for (let index = start; index < lines.length; index += 1) {
    const source = lines[index]!;
    if (/\b(?:in alphabetical order|Glossary)\b/iu.test(source.line)) {
      break;
    }
    const line = cleanLine(source.line);
    if (/^(?:#{1,6}\s*)?unit\s*$/iu.test(line) && currentUnit === 0) {
      currentUnit = 1;
      continue;
    }
    const marker = line.match(unitPattern);
    if (marker) {
      if (currentUnit > 0 && pending) {
        flush(units[currentUnit - 1]!);
      }
      currentUnit = Number(marker[1]);
      pending = marker[2]?.trim() ?? "";
      if (currentUnit < 1 || currentUnit > expectedUnitCount) {
        currentUnit = 0;
        pending = "";
      }
      continue;
    }
    if (currentUnit === 0 || shouldSkipLine(source.line)) {
      continue;
    }
    pending = `${pending} ${line}`.trim();
    if (pageSuffixPattern.test(pending)) {
      pageSuffixPattern.lastIndex = 0;
      flush(units[currentUnit - 1]!);
    }
    pageSuffixPattern.lastIndex = 0;
  }
  if (currentUnit > 0 && pending) {
    flush(units[currentUnit - 1]!);
  }

  repairMissingUnitsByPageGaps(units);
  deduplicateUnits(units);
  return parsedResult(markdown, units);
}

export function parseHujiaoAlphabeticalPageWordlist(
  markdown: string,
  unitStartPages: readonly number[]
): ParsedTypingWordlist {
  if (unitStartPages.length === 0 || unitStartPages.some((page, index) => (
    !Number.isInteger(page)
    || page <= 0
    || (index > 0 && page <= unitStartPages[index - 1]!)
  ))) {
    throw new Error("沪教版单元起始页必须为严格递增的正整数");
  }
  const lines = sourceLines(markdown);
  const start = findLastLine(lines, (entry) => /\bin alphabetical order\b/iu.test(entry.line));
  if (start < 0) {
    throw new Error("沪教版教材中未找到按字母编排的页码词汇表");
  }
  const units = emptyUnits(unitStartPages.length);
  let pending = "";
  let lastLexicalEnglish = "";

  const flush = () => {
    const matches = [...pending.matchAll(pageSuffixPattern)];
    let consumed = 0;
    for (const match of matches) {
      const raw = pending.slice(consumed, match.index).trim();
      const page = Number(match[1]);
      if (raw) {
        const unitIndex = findPageUnit(page, unitStartPages);
        if (unitIndex < 0) {
          throw new Error(`沪教版第 ${page} 页词汇早于首个单元起始页`);
        }
        lastLexicalEnglish = appendPageItem(
          units[unitIndex]!,
          raw,
          page,
          lastLexicalEnglish
        ) ?? lastLexicalEnglish;
      }
      consumed = match.index! + match[0].length;
    }
    pending = pending.slice(consumed).trim();
  };

  for (let index = start + 1; index < lines.length; index += 1) {
    const source = lines[index]!;
    if (/\bProper nouns\b|^#{1,6}\s+(?:Glossary|Word list for junior high)\b/iu.test(source.line.trim())) {
      break;
    }
    if (shouldSkipLine(source.line)) {
      continue;
    }
    const line = cleanLine(source.line);
    pending = `${pending} ${line}`.replace(/\s+/gu, " ").trim();
    if (pageSuffixPattern.test(pending)) {
      pageSuffixPattern.lastIndex = 0;
      flush();
    }
    pageSuffixPattern.lastIndex = 0;
  }
  if (pending && pageSuffixPattern.test(pending)) {
    pageSuffixPattern.lastIndex = 0;
    flush();
  }
  pageSuffixPattern.lastIndex = 0;
  deduplicateUnits(units);
  return parsedResult(markdown, units);
}

export function parseHujiaoSeniorWordlist(
  markdown: string,
  expectedUnitCount: number
): ParsedTypingWordlist {
  const lines = sourceLines(markdown);
  const start = findLastLine(lines, (entry) => /Words and phrases by unit/iu.test(entry.line));
  if (start < 0) {
    throw new Error("沪教版高中教材中未找到按单元编排的词汇表");
  }

  const units = emptyUnits(expectedUnitCount);
  let currentUnit = 0;
  let phraseMode = false;
  let pending = "";
  let pendingPage = 0;

  const flush = () => {
    if (currentUnit > 0 && pending) {
      appendSeniorItem(units[currentUnit - 1]!, pending, pendingPage, phraseMode);
    }
    pending = "";
  };

  for (let index = start + 1; index < lines.length; index += 1) {
    const source = lines[index]!;
    const line = cleanLine(source.line);
    if (/^#{1,6}\s+(?:Glossary|Proper nouns)\b/iu.test(source.line.trim())) {
      break;
    }
    const marker = line.match(unitPattern);
    if (marker) {
      flush();
      currentUnit = Number(marker[1]);
      phraseMode = false;
      continue;
    }
    if (/^(?:#{1,6}\s*)?Phrases\s*$/iu.test(line)) {
      flush();
      phraseMode = true;
      continue;
    }
    if (currentUnit < 1 || currentUnit > expectedUnitCount || shouldSkipLine(source.line)) {
      continue;
    }

    const startsEntry = phraseMode
      ? Boolean(pending && hanPattern.test(pending))
      : /^\*?[A-Za-z][^/]{0,100}\/[^/]+\//u.test(line);
    if (startsEntry) {
      flush();
    }
    pending = `${pending} ${line}`.trim();
    pendingPage ||= source.page;
  }
  flush();

  return parsedResult(markdown, units);
}

function indexedEntriesFromBuffer(value: string) {
  const entries: { english: string; translation: string; unit: number }[] = [];
  const markerPattern = /\s*U(\d{1,2})(?=\s|[A-Za-zα]|$)/gu;
  let consumed = 0;
  for (const match of value.matchAll(markerPattern)) {
    const raw = value.slice(consumed, match.index).trim();
    const translationIndex = raw.search(hanPattern);
    if (translationIndex > 0) {
      entries.push({
        english: raw.slice(0, translationIndex).trim(),
        translation: raw.slice(translationIndex).trim(),
        unit: Number(match[1])
      });
    }
    consumed = match.index! + match[0].length;
  }
  return {
    entries,
    remainder: value.slice(consumed).trim()
  };
}

function isAlphabeticHeading(value: string) {
  return /^#{0,6}\s*[A-Z](?:\s+[A-Z])?\s*$/u.test(value)
    || /^#+\s*/u.test(value)
    || /^\d+$/u.test(value);
}

function appendDirectSegments(unit: ParsedTypingWordlistUnit, line: string, page: number) {
  const normalized = line.replace(/^#{1,6}\s*/u, "").replace(/α/gu, "a").replace(/\s+/gu, " ").trim();
  const boundaries = [...normalized.matchAll(/\p{Script=Han}[；;，、。！？）)]*\s+(?=[A-Za-z][A-Za-z0-9'’(])/gu)]
    .map((match) => match.index! + match[0].length)
    .filter((index) => /\p{Script=Han}/u.test(normalized.slice(0, index)));
  const segments: string[] = [];
  let start = 0;
  for (const boundary of boundaries) {
    const segment = normalized.slice(start, boundary).trim();
    if (segment) {
      segments.push(segment);
    }
    start = boundary;
  }
  const tail = normalized.slice(start).trim();
  if (tail) {
    segments.push(tail);
  }

  for (const segment of segments) {
    const translationIndex = segment.search(hanPattern);
    if (translationIndex <= 0) {
      continue;
    }
    appendItem(unit, segment.slice(0, translationIndex), segment.slice(translationIndex), page);
  }
}

function appendPageItem(
  unit: ParsedTypingWordlistUnit,
  raw: string,
  page: number,
  inheritedEnglish = ""
) {
  let lastEnglish = inheritedEnglish;
  for (const segment of splitPhoneticEntries(raw)) {
    lastEnglish = appendSinglePageItem(unit, segment, page, lastEnglish) ?? lastEnglish;
  }
  return lastEnglish || null;
}

function appendSinglePageItem(
  unit: ParsedTypingWordlistUnit,
  raw: string,
  page: number,
  inheritedEnglish = ""
) {
  const normalized = raw
    .normalize("NFKC")
    .replace(/／/gu, "/")
    .replace(/^#{1,6}\s*(?:一|1)?\s*/u, "")
    .replace(/^(?:0|[)）])\s+(?=\*?[A-Za-z])/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  const isSpellingRequired = !normalized.startsWith("*");
  const body = normalized.replace(/^\*+/u, "").trim();
  const firstSlash = body.indexOf("/");
  const secondSlash = firstSlash >= 0 ? body.indexOf("/", firstSlash + 1) : -1;
  let english: string;
  let phonetic: string | null = null;
  let partOfSpeech: string | null = null;
  let translation: string;

  if (firstSlash === 0 && secondSlash > firstSlash) {
    const lexicalEnglish = inheritedEnglish || unit.items.at(-1)?.text || "";
    if (!lexicalEnglish) {
      return null;
    }
    phonetic = body.slice(1, secondSlash).trim() || null;
    const remainder = body.slice(secondSlash + 1).trim();
    const translationIndex = remainder.search(hanPattern);
    if (translationIndex < 0) {
      return lexicalEnglish;
    }
    const prefix = remainder.slice(0, translationIndex).trim();
    partOfSpeech = prefix.match(/^(?:(?:adj|adv|abbr|det|modal v|linking v|n|num|prep|pron|conj|vi|vt|v|u)\.[\s&.]*)+/iu)?.[0]?.trim() ?? null;
    translation = remainder.slice(translationIndex).trim();
    appendItem(unit, lexicalEnglish, translation, page, {
      isSpellingRequired,
      partOfSpeech,
      phonetic,
      sourceRaw: raw
    });
    return lexicalEnglish;
  } else if (firstSlash > 0 && secondSlash > firstSlash) {
    english = body.slice(0, firstSlash).trim();
    phonetic = body.slice(firstSlash + 1, secondSlash).trim() || null;
    const remainder = body.slice(secondSlash + 1).trim();
    const translationIndex = remainder.search(hanPattern);
    const prefix = translationIndex >= 0 ? remainder.slice(0, translationIndex).trim() : remainder;
    partOfSpeech = prefix.match(/^(?:(?:adj|adv|abbr|det|modal v|linking v|n|num|prep|pron|conj|vi|vt|v)\.[\s&.]*)+/iu)?.[0]?.trim() ?? null;
    translation = translationIndex >= 0 ? remainder.slice(translationIndex).trim() : "";
  } else {
    const translationIndex = body.search(hanPattern);
    if (translationIndex <= 0) {
      return;
    }
    english = body.slice(0, translationIndex).trim();
    translation = body.slice(translationIndex).trim();
  }
  const standalonePrefix = english.match(/[（(]+$/u)?.[0] ?? "";
  const standalonePartOfSpeech = english.slice(0, english.length - standalonePrefix.length);
  const inflectedPartOfSpeech = english.match(/^((?:adj|adv|abbr|det|modal v|linking v|n|num|prep|pron|conj|vi|vt|v|u)\.)(\([^)]*\))$/iu);
  const standaloneToken = inflectedPartOfSpeech?.[1] ?? standalonePartOfSpeech;
  if (/^(?:(?:adj|adv|abbr|det|modal v|linking v|n|num|prep|pron|conj|vi|vt|v|u)\.)$/iu.test(standaloneToken)) {
    const lexicalEnglish = inheritedEnglish || unit.items.at(-1)?.text || "";
    const continuedTranslation = `${standaloneToken}${inflectedPartOfSpeech?.[2] ?? standalonePrefix}${translation}`;
    const previous = unit.items.at(-1);
    if (previous && previous.normalizedText === normalizeTypingAnswer(lexicalEnglish)) {
      previous.translation = `${previous.translation ?? ""}；${continuedTranslation}`;
      previous.sourceRaw = `${previous.sourceRaw ?? previous.text} ${raw}`;
    } else if (lexicalEnglish) {
      appendItem(unit, lexicalEnglish, continuedTranslation, page, {
        isSpellingRequired,
        sourceRaw: raw
      });
    }
    return lexicalEnglish || null;
  }
  appendItem(unit, english, translation, page, { isSpellingRequired, partOfSpeech, phonetic, sourceRaw: raw });
  return english || null;
}

function appendSeniorItem(
  unit: ParsedTypingWordlistUnit,
  raw: string,
  page: number,
  phraseMode: boolean
) {
  for (const segment of splitPhoneticEntries(raw)) {
    appendSingleSeniorItem(unit, segment, page, phraseMode);
  }
}

function appendSingleSeniorItem(
  unit: ParsedTypingWordlistUnit,
  raw: string,
  page: number,
  phraseMode: boolean
) {
  const normalized = raw.replace(/\s+/gu, " ").trim();
  const isSpellingRequired = !normalized.startsWith("*");
  const body = normalized.replace(/^\*+/u, "").trim();
  const translationIndex = body.search(hanPattern);
  if (translationIndex <= 0) {
    return;
  }
  const translation = body.slice(translationIndex).trim();
  const englishPart = body.slice(0, translationIndex).trim();
  const firstSlash = englishPart.indexOf("/");
  const secondSlash = firstSlash >= 0 ? englishPart.indexOf("/", firstSlash + 1) : -1;
  let english: string;
  let phonetic: string | null = null;
  let partOfSpeech: string | null = null;

  if (firstSlash > 0 && secondSlash > firstSlash) {
    english = englishPart.slice(0, firstSlash).trim();
    phonetic = englishPart.slice(firstSlash + 1, secondSlash).trim() || null;
    partOfSpeech = englishPart.slice(secondSlash + 1).match(/^\s*((?:(?:adj|adv|abbr|det|modal v|linking v|n|num|prep|pron|conj|vi|vt|v)\.[\s&.]*)+)/iu)?.[1]?.trim() ?? null;
  } else if (phraseMode) {
    const definitionStart = findPhraseDefinitionStart(englishPart);
    english = definitionStart > 0 ? englishPart.slice(0, definitionStart).trim() : englishPart;
  } else {
    return;
  }

  appendItem(unit, english, translation, page, { isSpellingRequired, partOfSpeech, phonetic, sourceRaw: raw });
}

function splitPhoneticEntries(raw: string) {
  const matches = [...raw.matchAll(/\*?[A-Za-z][A-Za-z0-9 .'’(),-]{0,70}\s*\/{1,2}[^/\s\p{Script=Han}]{1,40}\//gu)];
  if (matches.length === 0) {
    return [raw];
  }
  const boundaries = matches
    .map((match) => match.index!)
    .filter((index) => index > 0 && hanPattern.test(raw.slice(0, index)));
  if (boundaries.length === 0) {
    return [raw];
  }
  const segments: string[] = [];
  let start = 0;
  for (const boundary of boundaries) {
    const segment = raw.slice(start, boundary).trim();
    if (segment) {
      segments.push(segment);
    }
    start = boundary;
  }
  const tail = raw.slice(start).trim();
  if (tail) {
    segments.push(tail);
  }
  return segments;
}

function findPhraseDefinitionStart(value: string) {
  const patterns = [
    /a (?=(?:large|small|short|long|person|place|thing|way|group|piece|set|state|process|situation|system|type|kind|number|form|method|traditional)\b)/giu,
    /the (?=(?:chance|act|process|state|condition|way|fact|ability|quality|practice|system|place|person|thing|time|amount|number)\b)/giu,
    /as (?=(?:much|many|if|though|soon|well)\b)/giu,
    /to (?=(?:give|make|do|be|have|use|show|describe|provide|move|become|cause|change|take|put|say|tell|look|find|keep)\b)/giu,
    /operations? that\b/giu,
    /very (?=(?:bright|large|small|strong|high|low|good|bad|clear|important)\b)/giu,
    /\s+(?=(?:a|an|the|to|when|where|used|having|being|making|doing|something|somebody)\b)/giu
  ];
  const indexes = patterns.flatMap((pattern) => [...value.matchAll(pattern)].map((match) => match.index!))
    .filter((index) => index > 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function appendItem(
  unit: ParsedTypingWordlistUnit,
  englishValue: string,
  translationValue: string,
  page: number,
  details: {
    isSpellingRequired?: boolean;
    partOfSpeech?: string | null;
    phonetic?: string | null;
    sourceRaw?: string;
  } = {}
) {
  const text = englishValue
    .normalize("NFKC")
    .replace(/α/gu, "a")
    .replace(/[‘’]/gu, "'")
    .replace(/^(?![aAiI]\s)[A-Za-z]\s+(?=[A-Za-z])/u, "")
    .replace(/\blotof\b/giu, "lot of")
    .replace(/^Idon't\b/u, "I don't")
    .replace(/^Ihope\b/u, "I hope")
    .replace(/^il$/iu, "ill")
    .replace(/^dlean$/iu, "clean")
    .replace(/[（(]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  const translation = translationValue
    .replace(/\s*\/{1,2}[^/\s\p{Script=Han}]{1,40}\/\s*(?:(?:adj|adv|abbr|det|modal v|linking v|n|num|prep|pron|conj|vi|vt|v|u)\.\s*)?[^\p{Script=Han}]*?(?=\p{Script=Han})/giu, "；")
    .replace(/[;；]\s*/gu, "；")
    .replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, "")
    .replace(/\s+(?=[（(])/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/\s+\d{1,3}$/u, "")
    .trim();
  if (!text || !translation) {
    return;
  }
  const item: ParsedTypingWordlistItem = {
    britishPhonetic: details.phonetic ?? null,
    isSpellingRequired: details.isSpellingRequired ?? !text.startsWith("*"),
    itemType: /\s/u.test(text) ? "PHRASE" : "WORD",
    normalizedText: normalizeTypingAnswer(text.replace(/^\*+/u, "")),
    partOfSpeech: details.partOfSpeech ?? null,
    sourceOrder: unit.items.length + 1,
    sourcePage: page,
    sourceRaw: details.sourceRaw ?? `${text} ${translation}`,
    text: text.replace(/^\*+/u, ""),
    translation
  };
  unit.items.push(item);
  unit.sourcePageStart = unit.sourcePageStart === null ? page : Math.min(unit.sourcePageStart, page);
  unit.sourcePageEnd = unit.sourcePageEnd === null ? page : Math.max(unit.sourcePageEnd, page);
}

function appendTranslationContinuation(unit: ParsedTypingWordlistUnit, continuation: string) {
  const previous = unit.items.at(-1);
  if (!previous) {
    return;
  }
  previous.translation = `${previous.translation ?? ""}${continuation}`;
  previous.sourceRaw = `${previous.sourceRaw ?? previous.text} ${continuation}`;
}

function hasSameItem(unit: ParsedTypingWordlistUnit, english: string, translation: string) {
  const normalized = normalizeTypingAnswer(english.replace(/^\*+/u, ""));
  const normalizedTranslation = translation.replace(/\s+/gu, "").replace(/[;；]/gu, "；");
  return unit.items.some((item) => item.normalizedText === normalized
    && (item.translation ?? "").replace(/\s+/gu, "").replace(/[;；]/gu, "；") === normalizedTranslation);
}

function deduplicateUnits(units: ParsedTypingWordlistUnit[]) {
  for (const unit of units) {
    const merged = new Map<string, ParsedTypingWordlistItem>();
    for (const item of unit.items) {
      const existing = merged.get(item.normalizedText);
      if (!existing) {
        merged.set(item.normalizedText, item);
        continue;
      }
      const existingTranslations = new Set((existing.translation ?? "").split("；").filter(Boolean));
      const additions = (item.translation ?? "").split("；").filter((part) => part && !existingTranslations.has(part));
      if (additions.length > 0) {
        existing.translation = [existing.translation, ...additions].filter(Boolean).join("；");
      }
      existing.sourcePage = Math.min(existing.sourcePage, item.sourcePage);
      existing.sourceRaw = `${existing.sourceRaw ?? existing.text} ${item.sourceRaw ?? item.text}`;
      existing.britishPhonetic ??= item.britishPhonetic;
      existing.partOfSpeech ??= item.partOfSpeech;
      existing.isSpellingRequired &&= item.isSpellingRequired;
    }
    unit.items = [...merged.values()].map((item, index) => ({ ...item, sourceOrder: index + 1 }));
    refreshUnitPages(unit);
  }
}

function repairMissingUnitsByPageGaps(units: ParsedTypingWordlistUnit[]) {
  for (let nextIndex = 1; nextIndex < units.length; nextIndex += 1) {
    if (units[nextIndex]!.items.length > 0 || units[nextIndex - 1]!.items.length === 0) {
      continue;
    }
    let populatedNext = nextIndex + 1;
    while (populatedNext < units.length && units[populatedNext]!.items.length === 0) {
      populatedNext += 1;
    }
    if (populatedNext >= units.length) {
      continue;
    }
    const missingCount = populatedNext - nextIndex;
    const source = units[nextIndex - 1]!;
    const uniquePages = [...new Set(source.items.map((item) => item.sourcePage))].sort((left, right) => left - right);
    const gaps = uniquePages.slice(1).map((page, index) => ({
      gap: page - uniquePages[index]!,
      threshold: page
    })).sort((left, right) => right.gap - left.gap || left.threshold - right.threshold);
    const thresholds = gaps.slice(0, missingCount).map((entry) => entry.threshold).sort((left, right) => left - right);
    if (thresholds.length !== missingCount || thresholds.some((threshold, index) => {
      const previousPage = uniquePages[uniquePages.indexOf(threshold) - 1] ?? threshold;
      return threshold - previousPage < 4 || (index > 0 && threshold <= thresholds[index - 1]!);
    })) {
      continue;
    }
    const groups = Array.from({ length: missingCount + 1 }, () => [] as ParsedTypingWordlistItem[]);
    for (const item of source.items) {
      const group = thresholds.findIndex((threshold) => item.sourcePage < threshold);
      groups[group < 0 ? missingCount : group]!.push(item);
    }
    if (groups.some((group) => group.length === 0)) {
      continue;
    }
    source.items = groups[0]!;
    refreshUnitPages(source);
    for (let offset = 0; offset < missingCount; offset += 1) {
      units[nextIndex + offset]!.items = groups[offset + 1]!;
      refreshUnitPages(units[nextIndex + offset]!);
    }
  }
}

function findPageUnit(page: number, unitStartPages: readonly number[]) {
  for (let index = unitStartPages.length - 1; index >= 0; index -= 1) {
    if (page >= unitStartPages[index]!) {
      return index;
    }
  }
  return -1;
}

function refreshUnitPages(unit: ParsedTypingWordlistUnit) {
  unit.items = unit.items.map((item, index) => ({ ...item, sourceOrder: index + 1 }));
  const pages = unit.items.map((item) => item.sourcePage);
  unit.sourcePageStart = pages.length > 0 ? Math.min(...pages) : null;
  unit.sourcePageEnd = pages.length > 0 ? Math.max(...pages) : null;
}

function sourceLines(markdown: string): SourceLine[] {
  let page = 0;
  return markdown.split(/\r?\n/u).map((line) => {
    const pageMatch = line.match(/^##\s+第\s*(\d+)\s*页\s*$/u);
    if (pageMatch) {
      page = Number(pageMatch[1]);
    }
    return { line, page };
  });
}

function emptyUnits(count: number): ParsedTypingWordlistUnit[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("沪教版词表单元数必须为正整数");
  }
  return Array.from({ length: count }, (_, index) => ({
    code: `unit-${String(index + 1).padStart(2, "0")}`,
    items: [],
    number: index + 1,
    sourcePageEnd: null,
    sourcePageStart: null,
    title: `Unit ${index + 1}`
  }));
}

function parsedResult(markdown: string, units: ParsedTypingWordlistUnit[]): ParsedTypingWordlist {
  return {
    sourceHash: createHash("sha256").update(markdown).digest("hex"),
    units
  };
}

function findLastUnitOne(lines: readonly SourceLine[]) {
  const index = findLastLine(lines, (entry) => {
    const marker = cleanLine(entry.line).match(unitPattern);
    return Number(marker?.[1]) === 1;
  });
  if (index < 0) {
    throw new Error("沪教版小学教材中未找到 Unit 1 词表");
  }
  return index;
}

function findLastLine(lines: readonly SourceLine[], predicate: (entry: SourceLine) => boolean) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (predicate(lines[index]!)) {
      return index;
    }
  }
  return -1;
}

function findLastLineBefore(
  lines: readonly SourceLine[],
  end: number,
  predicate: (entry: SourceLine) => boolean
) {
  for (let index = Math.min(end - 1, lines.length - 1); index >= 0; index -= 1) {
    if (predicate(lines[index]!)) {
      return index;
    }
  }
  return -1;
}

function cleanLine(value: string) {
  return value
    .replace(/^#+\s*/u, (heading) => heading)
    .replace(/^\|+|\|+$/gu, "")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/\s+/gu, " ")
    .trim();
}

function shouldSkipLine(value: string) {
  const line = value.trim();
  return !line
    || /^---$/u.test(line)
    || /^##\s+第\s*\d+\s*页/u.test(line)
    || /^!\[/u.test(line)
    || /上海教育出版社/u.test(line)
    || /^#{1,6}\s+[A-Z]\s*$/u.test(line)
    || /^说明[:：]?$/u.test(line)
    || /^注[:：]/u.test(line);
}

function isDirectSectionEnd(value: string) {
  return /^#{1,6}\s+(?:Proper nouns|Days of the week|Word list 2|后记)\b/iu.test(value.trim());
}
