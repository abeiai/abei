export type EnglishTitleCaseMode = "SENTENCE" | "TITLE" | "UPPER";

const nextEnglishTitleCaseMode: Record<EnglishTitleCaseMode, EnglishTitleCaseMode> = {
  SENTENCE: "TITLE",
  TITLE: "UPPER",
  UPPER: "SENTENCE"
};

const englishTitleCaseMinorWords = new Set([
  "a",
  "an",
  "the",
  "and",
  "but",
  "or",
  "nor",
  "for",
  "so",
  "yet",
  "as",
  "at",
  "by",
  "down",
  "from",
  "in",
  "into",
  "like",
  "near",
  "of",
  "off",
  "on",
  "onto",
  "out",
  "over",
  "past",
  "per",
  "than",
  "to",
  "up",
  "upon",
  "via",
  "with"
]);

function uppercaseFirstLetter(word: string) {
  return word.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("en-US"));
}

export function formatEnglishTitleCase(title: string, mode: EnglishTitleCaseMode) {
  if (mode === "UPPER") {
    return title.toLocaleUpperCase("en-US");
  }

  const lowercaseTitle = title.toLocaleLowerCase("en-US");

  if (mode === "SENTENCE") {
    return lowercaseTitle.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("en-US"));
  }

  const words = lowercaseTitle.match(/\p{L}+(?:['’]\p{L}+)*/gu) ?? [];
  let wordIndex = 0;

  return lowercaseTitle.replace(/\p{L}+(?:['’]\p{L}+)*/gu, (word) => {
    const isFirstOrLastWord = wordIndex === 0 || wordIndex === words.length - 1;
    wordIndex += 1;

    if (!isFirstOrLastWord && englishTitleCaseMinorWords.has(word)) {
      return word;
    }

    return uppercaseFirstLetter(word);
  });
}

export function cycleEnglishTitleCase(title: string, mode: EnglishTitleCaseMode) {
  return {
    title: formatEnglishTitleCase(title, mode),
    nextMode: nextEnglishTitleCaseMode[mode]
  };
}
