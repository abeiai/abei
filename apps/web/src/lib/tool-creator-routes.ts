const creatorSegment = "creator";

export function createToolCreatorId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function mediaTutorCreatorPath(id: string) {
  return `/media-tutor/${creatorSegment}/${encodeURIComponent(id.trim())}`;
}

export function text2lessonCreatorPath(id: string) {
  return `/text2lesson/${creatorSegment}/${encodeURIComponent(id.trim())}`;
}

export function gushiwenCreatorPath(id: string) {
  return `/gushiwen/${creatorSegment}/${encodeURIComponent(id.trim())}`;
}

export function daoduCreatorPath(id: string) {
  return `/daodu/${creatorSegment}/${encodeURIComponent(id.trim())}`;
}

export function flashcardCreatorPath(id: string) {
  return `/flashcard/${creatorSegment}/${encodeURIComponent(id.trim())}`;
}

export function creatorIdFromSegments(segments?: string[]) {
  if (segments?.length !== 2 || segments[0] !== creatorSegment) {
    return "";
  }

  return segments[1]?.trim() ?? "";
}
