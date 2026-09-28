import {
  parseHujiaoPageWordlist,
  reassignHujiaoWordlistByPage
} from "./hujiao-typing-wordlist.js";
import type {
  PepTypingBookKey,
  PepTypingLibraryConfig
} from "./pep-typing-library-config.js";
import {
  normalizeTypingAnswer,
  type ParsedTypingWordlist,
  type ParsedTypingWordlistItem
} from "./typing-wordlist-parser.js";

export function buildPepTypingWordlist(
  markdown: string,
  config: PepTypingLibraryConfig
) {
  return applyPepBookCorrections(
    config.key,
    parsePepTypingWordlist(markdown, config.unitStartPages)
  );
}

export function parsePepTypingWordlist(
  markdown: string,
  unitStartPages: readonly number[]
): ParsedTypingWordlist {
  const section = pepUnitWordlistSection(markdown);
  const parsed = parseHujiaoPageWordlist(section, unitStartPages.length);
  const reassigned = reassignHujiaoWordlistByPage(parsed, unitStartPages);
  for (const unit of reassigned.units) {
    for (const item of unit.items) {
      item.isSpellingRequired = true;
    }
  }
  return reassigned;
}

export function applyPepBookCorrections(
  key: PepTypingBookKey,
  parsed: ParsedTypingWordlist
): ParsedTypingWordlist {
  const units = structuredClone(parsed.units);
  const allItems = units.flatMap((unit) => unit.items);

  for (const item of allItems) {
    restorePepLeadingUsageNote(item);
    correctPepTranslationOcr(key, item);
    if (key === "3a" && item.text === "red" && item.translation?.includes("小熊猫")) {
      setItemText(item, "red panda");
    }
    if (key === "3a" && item.text === "o'clock") {
      item.translation = "（表示整点）……点钟";
    }
    if (key === "3a" && /^\.{4,}$/u.test(item.text)) {
      setItemText(item, "one");
      item.translation = "一";
    }
    if (key === "3b" && item.text === "shelf") {
      item.translation = "架子（复数 shelves）";
    }
    if (key === "3b" && item.text === "in" && item.translation?.includes("课堂")) {
      setItemText(item, "in class");
    }
    if (key === "4a" && item.text === "maths" && item.translation === "数学书") {
      setItemText(item, "maths book");
    }
    if (key === "4a" && item.text === "English" && item.translation === "英语书") {
      setItemText(item, "English book");
    }
    if (key === "4a" && item.text === "Chinese" && item.translation === "语文书") {
      setItemText(item, "Chinese book");
    }
    if (key === "4a" && item.text === "living" && item.translation?.includes("客厅")) {
      setItemText(item, "living room");
    }
    if (key === "4a" && item.text === "baby" && item.translation?.includes("小弟弟")) {
      setItemText(item, "baby brother");
    }
    if (key === "4a" && item.text === "So much") {
      setItemText(item, "so much");
    }
    if (key === "4b") {
      correctGrade4BItem(item);
    }
    if (key === "5a" && item.text === "Send") {
      setItemText(item, "send");
    }
    if (key === "5a" && item.text === "Dear") {
      setItemText(item, "dear");
    }
    if (key === "5a" && item.text === "aren't") {
      item.translation = "are not 的缩写";
    }
    if (key === "5b") {
      correctGrade5BItem(item);
    }
    if (key === "6b" && item.text === "lookup") {
      setItemText(item, "look up");
    }
  }

  if (key === "3b") {
    const unit1 = units[0]!;
    if (!unit1.items.some((item) => item.normalizedText === "from")) {
      const whereIndex = unit1.items.findIndex((item) => item.normalizedText === "where");
      const source = unit1.items[Math.max(0, whereIndex)]!;
      unit1.items.splice(whereIndex + 1, 0, {
        ...source,
        britishPhonetic: "frəm",
        normalizedText: "from",
        sourceRaw: "from /frəm/ 来自；从 p.4（根据教材词表页面补回 OCR 丢失英文）",
        text: "from",
        translation: "来自；从"
      });
    }
    for (const unit of units) {
      unit.items = unit.items.filter((item) => item.text !== "shelves");
    }
  }

  for (const unit of units) {
    refreshUnit(unit);
  }
  return { sourceHash: parsed.sourceHash, units };
}

export function assertPepWordlistQuality(parsed: ParsedTypingWordlist, title: string) {
  for (const unit of parsed.units) {
    const normalized = new Set<string>();
    for (const item of unit.items) {
      if (
        !item.text.trim()
        || !item.translation?.match(/\p{Script=Han}/u)
        || hasBrokenPepTranslation(item.translation)
        || /Appendix|出版社|^Unit\b|^\.{4,}$/iu.test(item.text)
      ) {
        throw new Error(`${title}/${unit.title} 存在未清理词条：${item.text}`);
      }
      if (!item.isSpellingRequired) {
        throw new Error(`${title}/${unit.title}/${item.text} 未纳入拼写练习`);
      }
      if (normalized.has(item.normalizedText)) {
        throw new Error(`${title}/${unit.title} 存在重复答案：${item.text}`);
      }
      normalized.add(item.normalizedText);
    }
  }
}

function restorePepLeadingUsageNote(item: ParsedTypingWordlistItem) {
  if (!item.sourceRaw || /^[（(]/u.test(item.translation ?? "")) {
    return;
  }
  const sourceRaw = item.sourceRaw.trim().replace(/^\*+/u, "");
  const firstSlash = sourceRaw.indexOf("/");
  let rawTranslation = "";
  if (firstSlash >= 0) {
    const remaining = sourceRaw.slice(firstSlash + 1);
    const secondSlashOffset = remaining.search(/[/／]/u);
    if (secondSlashOffset < 0) {
      return;
    }
    rawTranslation = remaining.slice(secondSlashOffset + 1).trim();
  } else if (
    sourceRaw.replace(/α/gu, "a").toLocaleLowerCase("en-GB")
      .startsWith(item.text.toLocaleLowerCase("en-GB"))
  ) {
    rawTranslation = sourceRaw.slice(item.text.length).trim();
  }
  if (!/^[（(]/u.test(rawTranslation) || !rawTranslation.match(/\p{Script=Han}/u)) {
    return;
  }
  item.translation = normalizePepTranslation(rawTranslation);
}

function normalizePepTranslation(value: string) {
  return value
    .replace(/^\(\s*/u, "（")
    .replace(/\s+/gu, " ")
    .replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, "")
    .replace(/([A-Za-z])(?=\p{Script=Han})/gu, "$1 ")
    .replace(/-ing(?=\p{Script=Han})/giu, "-ing ")
    .replace(/（\s+/gu, "（")
    .replace(/\s+([，。；：、）])/gu, "$1")
    .replace(/）\s+/gu, "）")
    .trim();
}

function correctPepTranslationOcr(key: PepTypingBookKey, item: ParsedTypingWordlistItem) {
  const corrections = new Map<string, string>([
    ["3b\u0000twenty", "二十"],
    ["5a\u0000do", "做；干"],
    ["5b\u0000leaf", "叶子（复数 leaves）"],
    ["6b\u0000metre", "米（美式英语：meter）"]
  ]);
  const translation = corrections.get(`${key}\u0000${item.text}`);
  if (translation) {
    item.translation = translation;
  }
}

function hasBrokenPepTranslation(translation: string) {
  const openingParentheses = translation.match(/[（(]/gu)?.length ?? 0;
  const closingParentheses = translation.match(/[）)]/gu)?.length ?? 0;
  return /^的(?:第三人称|复数|比较级|过去式|-ing)/u.test(translation)
    || openingParentheses !== closingParentheses
    || /(?:\+|；千|[:：])$/u.test(translation);
}

function correctGrade4BItem(item: ParsedTypingWordlistItem) {
  const exactByMeaning = new Map([
    ["first\u0000一楼", "first floor"],
    ["second\u0000二楼", "second floor"],
    ["computer\u0000计算机房", "computer room"],
    ["art\u0000美术教室", "art room"],
    ["music\u0000音乐教室", "music room"],
    ["PE\u0000体育课", "PE class"],
    ["go\u0000去上学", "go to school"],
    ["hurry\u0000快点", "hurry up"],
    ["come\u0000快；加油", "come on"],
    ["just\u0000稍等一会儿", "just a minute"]
  ]);
  const corrected = exactByMeaning.get(`${item.text}\u0000${item.translation}`);
  if (corrected) {
    setItemText(item, corrected);
  } else if (item.text === "teachers' off ice") {
    setItemText(item, "teachers' office");
  }
}

function correctGrade5BItem(item: ParsedTypingWordlistItem) {
  const exact = new Map([
    ["clean myroom", "clean my room"],
    ["Sound", "sound"],
    ["having ...lass", "having ... class"],
    ["readingabook", "reading a book"]
  ]);
  const corrected = exact.get(item.text);
  if (corrected) {
    setItemText(item, corrected);
    return;
  }
  const ordinal = item.text.match(/^([A-Za-z-]+)\s*\(\d+(?:st|nd|rd|th)\)$/u);
  if (ordinal) {
    setItemText(item, ordinal[1]!);
  }
}

function setItemText(item: ParsedTypingWordlistItem, text: string) {
  item.text = text;
  item.normalizedText = normalizeTypingAnswer(text);
  item.itemType = /\s/u.test(text) ? "PHRASE" : "WORD";
}

function refreshUnit(unit: ParsedTypingWordlist["units"][number]) {
  unit.items = unit.items.map((item, index) => ({ ...item, sourceOrder: index + 1 }));
  const pages = unit.items.map((item) => item.sourcePage);
  unit.sourcePageStart = pages.length > 0 ? Math.min(...pages) : null;
  unit.sourcePageEnd = pages.length > 0 ? Math.max(...pages) : null;
}

function pepUnitWordlistSection(markdown: string) {
  const headings = [...markdown.matchAll(/^#{1,6}\s+Words in each unit\s*$/gimu)];
  const heading = headings.at(-1);
  if (!heading?.index && heading?.index !== 0) {
    throw new Error("人教版（PEP）教材中未找到 Words in each unit 单元词汇表");
  }
  const tail = markdown.slice(heading.index);
  const vocabulary = tail.match(/^#{1,6}\s+Vocabulary\s*$/imu);
  const bounded = vocabulary?.index === undefined ? tail : tail.slice(0, vocabulary.index);

  return bounded
    .split(/\r?\n/u)
    .filter((line) => !isPepPageFurniture(line))
    .join("\n")
    .replace(/^(#{0,6}\s*Unit\s*\d+)(?=[A-Za-z])/gimu, "$1 ")
    .replace(/^(#{0,6}\s*Unit\s*\d+)\s+Unit\s*$/gimu, "$1")
    .replace(/aren't\s*=\s*are not\s+p\s*\.\s*61/giu, "aren't /ɑːnt/ 是 are not 的缩写 p.61");
}

function isPepPageFurniture(value: string) {
  const line = value.trim();
  return /^#{1,6}\s*(?:[.·…\s]*Appendix\b|单元词汇表|(?:人民|民)教育出版社)/iu.test(line)
    || /^[（(]?注[:：]/u.test(line);
}
