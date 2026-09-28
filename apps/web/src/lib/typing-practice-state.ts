export type TypingPracticePhase =
  | "LOADING"
  | "READY"
  | "TYPING"
  | "CHECKING"
  | "INCORRECT"
  | "CORRECT_REVEAL"
  | "COMPLETED"
  | "PAUSED";

export type TypingCharacterErrorType = "SUBSTITUTION" | "MISSING" | "EXTRA" | "CASE";

export interface TypingCharacterError {
  type: TypingCharacterErrorType;
  expectedIndex: number;
  actualIndex: number;
}

export interface TypingPracticeErrorResult {
  tokenIndex: number;
  status: string;
  charErrors: number[];
  characterErrors?: TypingCharacterError[];
}

export interface TypingCharacterFeedback {
  character: string;
  status: "CORRECT" | "INCORRECT" | "MISSING";
}

export interface TypingFocusableInput {
  disabled: boolean;
  value: string;
  focus: (options?: { preventScroll?: boolean }) => void;
  setSelectionRange: (start: number, end: number) => void;
}

export type TypingAnswerSlot =
  | { kind: "WORD"; length: number }
  | { kind: "PUNCTUATION"; text: string };

export interface TypingPracticeState {
  phase: TypingPracticePhase;
  sessionId: string | null;
  questionId: string | null;
  answer: string;
  result: TypingPracticeErrorResult[];
  error: string;
}

export const initialTypingPracticeState: TypingPracticeState = {
  phase: "LOADING",
  sessionId: null,
  questionId: null,
  answer: "",
  result: [],
  error: ""
};

export type TypingPracticeAction =
  | { type: "LOADED"; sessionId: string; questionId: string | null }
  | { type: "QUESTION_CHANGED"; questionId: string | null }
  | { type: "INPUT_CHANGED"; answer: string }
  | { type: "SUBMITTING" }
  | { type: "INCORRECT"; result: TypingPracticeErrorResult[] }
  | { type: "CORRECT" }
  | { type: "COMPLETED" }
  | { type: "PAUSED" }
  | { type: "RESUMED" }
  | { type: "FAILED"; error: string };

export function typingPracticeReducer(
  state: TypingPracticeState,
  action: TypingPracticeAction
): TypingPracticeState {
  switch (action.type) {
    case "LOADED":
      return {
        ...initialTypingPracticeState,
        phase: action.questionId ? "READY" : "COMPLETED",
        sessionId: action.sessionId,
        questionId: action.questionId
      };
    case "QUESTION_CHANGED":
      return {
        ...state,
        phase: action.questionId ? "READY" : "COMPLETED",
        questionId: action.questionId,
        answer: "",
        result: [],
        error: ""
      };
    case "INPUT_CHANGED":
      return { ...state, phase: "TYPING", answer: action.answer, result: [], error: "" };
    case "SUBMITTING":
      return { ...state, phase: "CHECKING", error: "" };
    case "INCORRECT":
      return { ...state, phase: "INCORRECT", result: action.result };
    case "CORRECT":
      return { ...state, phase: "CORRECT_REVEAL", result: [] };
    case "COMPLETED":
      return { ...state, phase: "COMPLETED", questionId: null, answer: "", result: [] };
    case "PAUSED":
      return { ...state, phase: "PAUSED" };
    case "RESUMED":
      return { ...state, phase: state.answer ? "TYPING" : "READY" };
    case "FAILED":
      return { ...state, phase: state.answer ? "TYPING" : "READY", error: action.error };
    default:
      return state;
  }
}

export function buildTypingCharacterFeedback(
  value: string,
  errors: TypingCharacterError[]
): TypingCharacterFeedback[] {
  const characters = Array.from(value);
  const missingByIndex = new Map<number, number>();
  const incorrectIndices = new Set<number>();

  for (const error of errors) {
    const actualIndex = Math.max(0, Math.min(characters.length, error.actualIndex));
    if (error.type === "MISSING") {
      missingByIndex.set(actualIndex, (missingByIndex.get(actualIndex) ?? 0) + 1);
    } else if (actualIndex < characters.length) {
      incorrectIndices.add(actualIndex);
    }
  }

  const feedback: TypingCharacterFeedback[] = [];
  for (let index = 0; index <= characters.length; index += 1) {
    for (let count = 0; count < (missingByIndex.get(index) ?? 0); count += 1) {
      feedback.push({ character: "□", status: "MISSING" });
    }
    if (index < characters.length) {
      feedback.push({
        character: characters[index]!,
        status: incorrectIndices.has(index) ? "INCORRECT" : "CORRECT"
      });
    }
  }
  return feedback;
}

export function focusTypingInput(input: TypingFocusableInput | null): boolean {
  if (!input || input.disabled) return false;
  input.focus({ preventScroll: true });
  const cursorPosition = input.value.length;
  input.setSelectionRange(cursorPosition, cursorPosition);
  return true;
}

export function assembleTypingAnswer(slots: TypingAnswerSlot[], words: string[]) {
  let wordIndex = 0;
  let answer = "";
  let previousKind: TypingAnswerSlot["kind"] | null = null;
  let previousPunctuation = "";

  for (const slot of slots) {
    if (slot.kind === "WORD") {
      if (
        previousKind === "WORD"
        || (previousKind === "PUNCTUATION" && /[,.!?;:)]/u.test(previousPunctuation))
      ) {
        answer += " ";
      }
      answer += words[wordIndex] ?? "";
      wordIndex += 1;
    } else {
      if (previousKind === "WORD" && (slot.text === "(" || slot.text.startsWith("..."))) {
        answer += " ";
      }
      answer += slot.text;
      previousPunctuation = slot.text;
    }
    previousKind = slot.kind;
  }

  return answer;
}

export function isEnglishTypingInput(value: string): boolean {
  return /^[\p{Script=Latin}\p{M}\x20-\x7e\t\r\n]*$/u.test(value);
}
