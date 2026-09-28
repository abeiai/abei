import { tokenizeTypingAnswer } from "./typing-answer.js";

export interface TypingQuestionPresentationInput {
  id: string;
  version: string;
  translation: string | null;
  answerSnapshot: string;
  britishPhonetic: string | null;
  partOfSpeech: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  hintLevel: number;
  lastErrorTokenIndex: number | null;
  revealed: boolean;
}

export interface TypingQuestionPresentation {
  id: string;
  version: string;
  prompt: string;
  imageUrl: string | null;
  audioUrl: string | null;
  slots: Array<
    | { kind: "WORD"; length: number }
    | { kind: "PUNCTUATION"; text: string }
  >;
  requiresAnswer: boolean;
  hint?:
    | { level: 1; words: Array<{ tokenIndex: number; initial: string; length: number }> }
    | { level: 2; tokenIndex: number; word: string };
  explanation?: {
    text: string;
    britishPhonetic: string | null;
    partOfSpeech: string | null;
    translation: string | null;
    tokens: ReturnType<typeof tokenizeTypingAnswer>;
  };
}

export function presentTypingQuestion(
  input: TypingQuestionPresentationInput
): TypingQuestionPresentation {
  const tokens = tokenizeTypingAnswer(input.answerSnapshot);
  const wordTokens = tokens.filter((token) => token.kind === "WORD");
  const result: TypingQuestionPresentation = {
    id: input.id,
    version: input.version,
    prompt: input.translation?.trim() || "请根据读音输入英文",
    imageUrl: input.imageUrl,
    audioUrl: input.audioUrl,
    requiresAnswer: !input.revealed,
    slots: tokens.map((token) => token.kind === "WORD"
      ? { kind: "WORD", length: token.length }
      : { kind: "PUNCTUATION", text: token.text })
  };

  if (input.revealed || input.hintLevel >= 3) {
    result.explanation = {
      text: input.answerSnapshot,
      britishPhonetic: input.britishPhonetic,
      partOfSpeech: input.partOfSpeech,
      translation: input.translation,
      tokens
    };
    return result;
  }

  if (input.hintLevel === 1) {
    result.hint = {
      level: 1,
      words: wordTokens.map((token, tokenIndex) => ({
        tokenIndex,
        initial: Array.from(token.text)[0] ?? "",
        length: token.length
      }))
    };
  }

  if (input.hintLevel === 2 && wordTokens.length > 0) {
    const tokenIndex = clampTokenIndex(input.lastErrorTokenIndex, wordTokens.length);
    result.hint = {
      level: 2,
      tokenIndex,
      word: wordTokens[tokenIndex]!.text
    };
  }

  return result;
}

function clampTokenIndex(value: number | null, length: number) {
  if (value === null || !Number.isSafeInteger(value)) return 0;
  return Math.max(0, Math.min(length - 1, value));
}
