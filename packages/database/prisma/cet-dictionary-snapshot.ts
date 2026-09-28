import type { CetExamKey } from "./cet-typing-wordlist.js";

export interface CetDictionarySnapshotItem {
  britishPhonetic: string | null;
  normalizedText: string;
  partOfSpeech: string | null;
  sourceRaw: string;
  text: string;
  translation: string;
}

export interface CetDictionarySnapshotEntry {
  normalizedWord: string;
  partOfSpeech: string | null;
  phonetic: string | null;
  tag: string;
  translation: string;
  word: string;
}

export function mergeCetDictionarySnapshot(
  itemsByExam: Record<CetExamKey, readonly CetDictionarySnapshotItem[]>
): CetDictionarySnapshotEntry[] {
  const entries = new Map<string, CetDictionarySnapshotEntry & { tags: Set<string> }>();

  for (const exam of ["cet4", "cet6"] as const) {
    for (const item of itemsByExam[exam]) {
      const normalizedWord = item.normalizedText.trim().toLocaleLowerCase("en-GB");
      const word = item.text.trim();
      const translation = item.translation.trim();
      const sourceTag = item.sourceRaw.match(/^ECDICT:(.+)$/u)?.[1]?.trim();
      if (!sourceTag) {
        throw new Error(`${word || normalizedWord || "未知词条"} 缺少 ECDICT 来源`);
      }
      if (!word || !normalizedWord || !translation) {
        throw new Error(`${word || normalizedWord || "未知词条"} 缺少释义或词形`);
      }

      const candidate = {
        normalizedWord,
        partOfSpeech: item.partOfSpeech?.trim() || null,
        phonetic: item.britishPhonetic?.trim() || null,
        translation,
        word
      };
      const existing = entries.get(normalizedWord);
      if (existing) {
        if (
          existing.word !== candidate.word
          || existing.translation !== candidate.translation
          || existing.phonetic !== candidate.phonetic
          || existing.partOfSpeech !== candidate.partOfSpeech
        ) {
          throw new Error(`${word} 在 CET4/CET6 快照中的内容不一致`);
        }
        for (const tag of sourceTag.split(/\s+/u)) existing.tags.add(tag.toLocaleLowerCase("en-GB"));
        existing.tags.add(exam);
        continue;
      }

      entries.set(normalizedWord, {
        ...candidate,
        tag: "",
        tags: new Set([...sourceTag.split(/\s+/u), exam].map((tag) => tag.toLocaleLowerCase("en-GB")))
      });
    }
  }

  return [...entries.values()]
    .sort((left, right) => left.normalizedWord < right.normalizedWord ? -1 : 1)
    .map(({ tags, ...entry }) => ({ ...entry, tag: [...tags].filter(Boolean).sort().join(" ") }));
}
