import type {
  TypingAnswerComparison,
  TypingCharacterError,
  TypingComparisonErrorType,
  TypingTokenResult
} from "./typing.types.js";

const punctuationMap = new Map([
  ["，", ","],
  ["。", "."],
  ["！", "!"],
  ["？", "?"],
  ["；", ";"],
  ["：", ":"],
  ["＂", '"'],
  ["＇", "'"],
  ["（", "("],
  ["）", ")"]
]);

export interface TypingDisplayToken {
  kind: "WORD" | "PUNCTUATION";
  text: string;
  length: number;
}

export function normalizeTypingSubmission(value: string) {
  return Array.from(value.normalize("NFC").trim())
    .map((character) => {
      if (character === "’" || character === "‘") return "'";
      if (character === "“" || character === "”") return '"';
      return punctuationMap.get(character) ?? character;
    })
    .join("");
}

export function tokenizeTypingAnswer(value: string): TypingDisplayToken[] {
  const normalized = normalizeTypingSubmission(value);
  const matches = normalized.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*|[^\sA-Za-z]+/gu) ?? [];

  return matches.map((text) => ({
    kind: /^[A-Za-z]+(?:[-'][A-Za-z]+)*$/u.test(text) ? "WORD" : "PUNCTUATION",
    text,
    length: Array.from(text).length
  }));
}

export function compareTypingAnswer(expectedValue: string, actualValue: string): TypingAnswerComparison {
  const expected = normalizeTypingSubmission(expectedValue);
  const actual = normalizeTypingSubmission(actualValue);
  const expectedWords = wordTexts(expected);
  const actualWords = wordTexts(actual);

  if (expected === actual) {
    return correctComparison(expectedWords.length);
  }

  const errorType = classifyError(expected, actual, expectedWords, actualWords);
  const tokenResults = expectedWords.map((expectedWord, tokenIndex) =>
    compareWord(expectedWord, actualWords[tokenIndex], tokenIndex, errorType));
  const firstErrorTokenIndex = tokenResults.find((result) => result.status !== "CORRECT")?.tokenIndex
    ?? (errorType === "PUNCTUATION_ERROR" || errorType === "WHITESPACE_ERROR" ? 0 : null);

  return {
    correct: false,
    errorTypes: [errorType],
    firstErrorTokenIndex,
    tokenResults
  };
}

function correctComparison(wordCount: number): TypingAnswerComparison {
  return {
    correct: true,
    errorTypes: [],
    firstErrorTokenIndex: null,
    tokenResults: Array.from({ length: wordCount }, (_, tokenIndex) => ({
      tokenIndex,
      status: "CORRECT" as const,
      charErrors: [],
      characterErrors: []
    }))
  };
}

function classifyError(
  expected: string,
  actual: string,
  expectedWords: string[],
  actualWords: string[]
): TypingComparisonErrorType {
  if (actualWords.length < expectedWords.length || !actual) return "INCOMPLETE";
  if (collapseWhitespace(expected) === collapseWhitespace(actual)) return "WHITESPACE_ERROR";
  if (expected.toLocaleLowerCase("en") === actual.toLocaleLowerCase("en")) return "CASE_ERROR";
  if (lettersAndSpaces(expected) === lettersAndSpaces(actual)) return "PUNCTUATION_ERROR";
  return "SPELLING_ERROR";
}

function compareWord(
  expected: string,
  actual: string | undefined,
  tokenIndex: number,
  globalError: TypingComparisonErrorType
): TypingTokenResult {
  if (expected === actual) {
    return { tokenIndex, status: "CORRECT", charErrors: [], characterErrors: [] };
  }
  if (actual === undefined) {
    const characterErrors = Array.from(expected, (_, expectedIndex) => ({
      type: "MISSING" as const,
      expectedIndex,
      actualIndex: 0
    }));
    return {
      tokenIndex,
      status: "INCOMPLETE",
      charErrors: Array.from({ length: expected.length }, (_, index) => index),
      characterErrors
    };
  }
  if (expected.toLocaleLowerCase("en") === actual.toLocaleLowerCase("en")) {
    const characterErrors = Array.from(expected).flatMap((character, index) =>
      character === actual[index]
        ? []
        : [{ type: "CASE" as const, expectedIndex: index, actualIndex: index }]);
    return {
      tokenIndex,
      status: "CASE_ERROR",
      charErrors: characterErrors.map((error) => error.actualIndex),
      characterErrors
    };
  }
  if (globalError === "PUNCTUATION_ERROR" || globalError === "WHITESPACE_ERROR") {
    return { tokenIndex, status: "CORRECT", charErrors: [], characterErrors: [] };
  }
  const characterErrors = differingCharacterErrors(expected, actual);
  return {
    tokenIndex,
    status: "SPELLING_ERROR",
    charErrors: [...new Set(characterErrors.map((error) => error.actualIndex))]
      .sort((left, right) => left - right),
    characterErrors
  };
}

function differingCharacterErrors(expected: string, actual: string): TypingCharacterError[] {
  const rows = expected.length + 1;
  const columns = actual.length + 1;
  const distances = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let row = 0; row < rows; row += 1) distances[row]![0] = row;
  for (let column = 0; column < columns; column += 1) distances[0]![column] = column;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitution = distances[row - 1]![column - 1]! + (expected[row - 1] === actual[column - 1] ? 0 : 1);
      distances[row]![column] = Math.min(
        distances[row - 1]![column]! + 1,
        distances[row]![column - 1]! + 1,
        substitution
      );
    }
  }

  const errors: TypingCharacterError[] = [];
  let row = expected.length;
  let column = actual.length;
  while (row > 0 || column > 0) {
    const distance = distances[row]![column]!;
    if (
      column > 0
      && distances[row]![column - 1]! + 1 === distance
      && (
        row === 0
        || (
          expected[row - 1] === actual[column - 1]
          && distances[row - 1]![column - 1] === distance
        )
      )
    ) {
      errors.push({ type: "EXTRA", expectedIndex: row, actualIndex: column - 1 });
      column -= 1;
      continue;
    }
    if (
      row > 0
      && distances[row - 1]![column]! + 1 === distance
      && (
        column === 0
        || (
          expected[row - 1] === actual[column - 1]
          && distances[row - 1]![column - 1] === distance
        )
      )
    ) {
      errors.push({ type: "MISSING", expectedIndex: row - 1, actualIndex: column });
      row -= 1;
      continue;
    }
    if (row > 0 && column > 0 && expected[row - 1] === actual[column - 1]) {
      row -= 1;
      column -= 1;
      continue;
    }
    if (
      row > 0
      && column > 0
      && distances[row]![column] === distances[row - 1]![column - 1]! + 1
    ) {
      errors.push({ type: "SUBSTITUTION", expectedIndex: row - 1, actualIndex: column - 1 });
      row -= 1;
      column -= 1;
      continue;
    }
    if (row > 0 && distances[row]![column] === distances[row - 1]![column]! + 1) {
      errors.push({ type: "MISSING", expectedIndex: row - 1, actualIndex: column });
      row -= 1;
      continue;
    }
    if (column === 0) break;
    column -= 1;
    errors.push({ type: "EXTRA", expectedIndex: row, actualIndex: column });
  }

  return errors.reverse();
}

function wordTexts(value: string) {
  return tokenizeTypingAnswer(value)
    .filter((token) => token.kind === "WORD")
    .map((token) => token.text);
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/gu, " ");
}

function lettersAndSpaces(value: string) {
  return collapseWhitespace(value.replace(/[^A-Za-z\s'-]/gu, ""));
}
