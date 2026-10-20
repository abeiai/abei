import type {
  NarrationTimelineNode,
  NarrationTimelineNodeType,
  VideoGuideLessonContent
} from "./video-guide-data.js";

export interface NarrationEditorItem {
  id: string;
  originalScript: string;
  type: NarrationTimelineNodeType;
  sourceText: string;
  script: string;
}

export interface NarrationEditorState {
  index: number;
  items: NarrationEditorItem[];
}

export class NarrationEditorValidationError extends Error {
  constructor(message: string, readonly index: number) {
    super(message);
    this.name = "NarrationEditorValidationError";
  }
}

export function createNarrationEditorState(
  content: VideoGuideLessonContent
): NarrationEditorState {
  const items = (content.narrationDraftTimeline ?? []).map(toEditorItem);

  if (items.length === 0) {
    throw new Error("当前课件没有可编辑的导学文稿");
  }

  return { index: 0, items };
}

export function moveNarrationEditor(
  state: NarrationEditorState,
  direction: "PREVIOUS" | "NEXT"
): NarrationEditorState {
  const offset = direction === "PREVIOUS" ? -1 : 1;

  return {
    ...state,
    index: Math.min(Math.max(state.index + offset, 0), state.items.length - 1)
  };
}

export function updateNarrationEditorScript(
  state: NarrationEditorState,
  script: string
): NarrationEditorState {
  return {
    ...state,
    items: state.items.map((item, index) =>
      index === state.index ? { ...item, script } : item
    )
  };
}

export function narrationEditorSavePayload(state: NarrationEditorState) {
  const current = state.items[state.index];

  if (!current || current.script.trim().length === 0) {
    throw new NarrationEditorValidationError("讲解文稿不能为空", state.index);
  }

  return {
    nodes: state.items.map(({ id, originalScript, script }, index) => ({
      id,
      originalScript,
      script: index === state.index ? script.trim() : originalScript
    }))
  };
}

function toEditorItem(node: NarrationTimelineNode): NarrationEditorItem {
  return {
    id: node.id,
    originalScript: node.script.trim(),
    type: node.type,
    sourceText:
      node.type === "INTRO"
        ? "导读开场"
        : node.type === "SUMMARY"
          ? "导读总结"
          : node.subtitle?.trim() || node.title,
    script: node.script
  };
}
