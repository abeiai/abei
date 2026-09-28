import {
  applyTypingWordlistCorrections,
  normalizeTypingAnswer,
  parseTypingAlphabeticalWordlist,
  parseTypingWordlist,
  type ParsedTypingWordlist,
  type ParsedTypingWordlistItem,
  type TypingWordlistCorrections
} from "./typing-wordlist-parser.js";

const hanPattern = /\p{Script=Han}/u;
const validAnswerStartPattern = /^(?:[\p{Script=Latin}0-9]|\([\p{Script=Latin}])/u;

export interface SeniorTypingWordlistCorrections extends TypingWordlistCorrections {
  removals?: readonly {
    sourceOrder: number;
    unitNumber: number;
  }[];
  textReplacements?: readonly {
    sourceOrder: number;
    text: string;
    unitNumber: number;
  }[];
}

export function buildSeniorTypingWordlist(
  markdown: string,
  corrections: SeniorTypingWordlistCorrections = {}
): ParsedTypingWordlist {
  const byUnit = applySeniorTextCorrections(
    applyTypingWordlistCorrections(parseTypingWordlist(markdown), corrections),
    corrections
  );
  const alphabetical = parseTypingAlphabeticalWordlist(markdown, [1]);
  const alphabeticalItems = alphabetical.units[0]?.items ?? [];
  const alphabeticalByKey = new Map<string, ParsedTypingWordlistItem>();

  for (const item of alphabeticalItems) {
    if (isValidSeniorAnswer(item.text)) {
      alphabeticalByKey.set(compactSeniorAnswer(item.text), item);
    }
  }

  const matchedAlphabeticalKeys = new Set<string>();
  const units = byUnit.units.map((unit) => {
    const seen = new Set<string>();
    const items: ParsedTypingWordlistItem[] = [];

    for (const item of unit.items) {
      assertValidSeniorAnswer(item, unit.number);
      const key = compactSeniorAnswer(item.text);
      if (seen.has(key)) {
        continue;
      }

      const alphabeticalItem = alphabeticalByKey.get(key)
        ?? findFuzzyAlphabeticalItem(item, alphabeticalItems);
      if (alphabeticalItem) {
        matchedAlphabeticalKeys.add(compactSeniorAnswer(alphabeticalItem.text));
      }

      seen.add(key);
      items.push(enrichSeniorItem(item, alphabeticalItem));
    }

    return {
      ...unit,
      items
    };
  });

  const allByUnitKeys = new Set(units.flatMap((unit) => (
    unit.items.map((item) => compactSeniorAnswer(item.text))
  )));

  for (const item of alphabeticalItems) {
    if (!isValidSeniorAnswer(item.text)) {
      continue;
    }
    const key = compactSeniorAnswer(item.text);
    if (matchedAlphabeticalKeys.has(key) || allByUnitKeys.has(key)) {
      continue;
    }

    const unit = findUnitForPage(units, item.sourcePage);
    if (!unit) {
      throw new Error(`第 ${item.sourcePage} 页高中词汇无法归入单元：${item.text}`);
    }

    unit.items.push(item);
    allByUnitKeys.add(key);
  }

  return {
    sourceHash: byUnit.sourceHash,
    units: units.map((unit) => {
      const items = unit.items.map((item, index) => ({
        ...item,
        sourceOrder: index + 1
      }));
      const pages = items.map((item) => item.sourcePage);

      return {
        ...unit,
        items,
        sourcePageEnd: pages.length > 0 ? Math.max(...pages) : null,
        sourcePageStart: pages.length > 0 ? Math.min(...pages) : null
      };
    })
  };
}

function applySeniorTextCorrections(
  parsed: ParsedTypingWordlist,
  corrections: SeniorTypingWordlistCorrections
) {
  const removals = new Set((corrections.removals ?? []).map((entry) => (
    `${entry.unitNumber}:${entry.sourceOrder}`
  )));
  const textReplacements = new Map((corrections.textReplacements ?? []).map((entry) => [
    `${entry.unitNumber}:${entry.sourceOrder}`,
    entry.text
  ]));

  const units = parsed.units.map((unit) => ({
    ...unit,
    items: unit.items.flatMap((item) => {
      const key = `${unit.number}:${item.sourceOrder}`;
      if (removals.delete(key)) {
        return [];
      }

      const text = textReplacements.get(key);
      if (!text) {
        return [item];
      }
      textReplacements.delete(key);
      const normalizedText = normalizeTypingAnswer(text);
      return [{
        ...item,
        itemType: /\s/u.test(text) ? "PHRASE" as const : "WORD" as const,
        normalizedText,
        sourceRaw: `${text} ${item.translation ?? ""}`.trim(),
        text
      }];
    })
  }));

  if (removals.size > 0 || textReplacements.size > 0) {
    throw new Error(`高中词表修正引用了不存在的来源顺序：${[
      ...removals,
      ...textReplacements.keys()
    ].join("、")}`);
  }

  return {
    ...parsed,
    units
  };
}

export function compactSeniorAnswer(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]/gu, "");
}

function enrichSeniorItem(
  item: ParsedTypingWordlistItem,
  alphabeticalItem: ParsedTypingWordlistItem | undefined
): ParsedTypingWordlistItem {
  if (!alphabeticalItem) {
    return item;
  }

  return {
    ...item,
    britishPhonetic: alphabeticalItem.britishPhonetic ?? item.britishPhonetic,
    partOfSpeech: alphabeticalItem.partOfSpeech ?? item.partOfSpeech,
    sourceRaw: alphabeticalItem.sourceRaw,
    translation: alphabeticalItem.translation ?? item.translation
  };
}

function findFuzzyAlphabeticalItem(
  item: ParsedTypingWordlistItem,
  alphabeticalItems: readonly ParsedTypingWordlistItem[]
) {
  const key = compactSeniorAnswer(item.text);
  if (key.length < 6) {
    return undefined;
  }

  return alphabeticalItems.find((candidate) => (
    isValidSeniorAnswer(candidate.text)
    && candidate.sourcePage === item.sourcePage
    && editDistanceAtMostOne(key, compactSeniorAnswer(candidate.text))
  ));
}

function editDistanceAtMostOne(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }
  if (left === right) {
    return true;
  }

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) {
      return false;
    }
    if (left.length > right.length) {
      leftIndex += 1;
    } else if (right.length > left.length) {
      rightIndex += 1;
    } else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

function findUnitForPage(units: ParsedTypingWordlist["units"], sourcePage: number) {
  const exact = units.filter((unit) => (
    unit.sourcePageStart !== null
    && unit.sourcePageEnd !== null
    && sourcePage >= unit.sourcePageStart
    && sourcePage <= unit.sourcePageEnd
  ));
  if (exact.length > 0) {
    return exact.at(-1);
  }

  return units.filter((unit) => (
    unit.sourcePageStart !== null && sourcePage >= unit.sourcePageStart
  )).at(-1);
}

function isValidSeniorAnswer(text: string) {
  return Boolean(
    text
    && validAnswerStartPattern.test(text)
    && !hanPattern.test(text)
    && !/[`#]/u.test(text)
    && compactSeniorAnswer(text)
  );
}

function assertValidSeniorAnswer(item: ParsedTypingWordlistItem, unitNumber: number) {
  if (!isValidSeniorAnswer(item.text)) {
    throw new Error(
      `Unit ${unitNumber} 第 ${item.sourceOrder} 条高中词汇英文内容不合法：${item.text}`
    );
  }
}
