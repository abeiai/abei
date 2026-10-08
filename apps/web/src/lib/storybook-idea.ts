export const STORY_IDEA_MAX_LENGTH = 500;

// Encoding keeps newlines and backslashes out of login continuation URLs.
export function encodeStoryIdea(idea: string) {
  const bytes = new TextEncoder().encode(idea);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeStoryIdea(value: unknown) {
  if (typeof value !== "string" || value.length > 2000 || !/^[A-Za-z0-9_-]+$/.test(value)) return "";
  try {
    const bytes = Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
    const idea = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return idea.length <= STORY_IDEA_MAX_LENGTH ? idea : "";
  } catch {
    return "";
  }
}
