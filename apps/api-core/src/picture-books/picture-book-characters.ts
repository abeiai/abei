import type { PictureBookCharacter } from "./picture-book-plan.js";
import { defaultPictureBookStyles, selectedPictureBookStyle } from "./picture-book-styles.js";
import { officialCharacterImageUrls } from "./picture-book-character-assets.js";

export const officialCharacters = [
  { id: "preset:boy", name: "小男孩", description: "约6岁的中国小男孩，黑色短发、圆脸、棕色眼睛，浅蓝色短袖T恤、深蓝色短裤、白色袜子和白色运动鞋" },
  { id: "preset:girl", name: "小女孩", description: "约6岁的中国小女孩，黑色齐耳波波头、圆脸、棕色眼睛，珊瑚红连衣裙配白色彼得潘领，黄色小帽配红色帽带，白色短袜和棕色小靴子" }
];

export function characterStyleKey(value: string) {
  return selectedPictureBookStyle(value, defaultPictureBookStyles)?.id ?? value;
}

export function characterImageForStyle(character: { styleImages?: unknown }, style: string): string | null {
  const images = character.styleImages;
  if (!images || typeof images !== "object" || Array.isArray(images)) return null;
  const key = characterStyleKey(style);
  const image = (images as Record<string, unknown>)[key] ?? Object.entries(images).find(([name]) => characterStyleKey(name) === key)?.[1];
  return typeof image === "string" && image ? image : null;
}

export function officialCharacter(id: string, style: string) {
  const character = officialCharacters.find(item => item.id === id);
  if (!character) return null;
  const key = characterStyleKey(style);
  const knownStyle = defaultPictureBookStyles.some(item => item.id === key);
  return { ...character, imageUrl: knownStyle ? officialCharacterImageUrls[`${id.slice(7)}/${key}`] ?? `/picture-book-characters/${id.slice(7)}/${key}.webp` : null };
}

interface ExtractedCharacter { name: string; description: string; kind: "boy" | "girl" | "other"; definedAppearance: boolean; replaceAppearance: boolean; previousName?: string }

export function parseCharacterDiscussion(output: string): { reply: string; characters: ExtractedCharacter[] } {
  const raw = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: Record<string, unknown>;
  try { value = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error("故事讨论格式不正确，请重试"); }
  if (!value || typeof value.reply !== "string" || !value.reply.trim() || !Array.isArray(value.characters)) throw new Error("故事讨论或角色信息不完整，请重试");
  const names = new Set<string>();
  const characters = value.characters.slice(0, 9).map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("角色信息不正确");
    const role = item as Record<string, unknown>;
    if (typeof role.name !== "string" || !role.name.trim() || role.name.length > 80 || typeof role.description !== "string" || role.description.trim().length < 2 || role.description.length > 1000 || !["boy", "girl", "other"].includes(String(role.kind)) || typeof role.definedAppearance !== "boolean") throw new Error("角色信息不正确");
    const name = role.name.trim();
    if (names.has(name)) throw new Error("角色名称重复");
    names.add(name);
    return { name, description: role.description.trim(), kind: role.kind as ExtractedCharacter["kind"], definedAppearance: role.definedAppearance, replaceAppearance: role.replaceAppearance === true && role.definedAppearance,
      ...(typeof role.previousName === "string" && role.previousName.trim().length <= 80 && role.previousName.trim() ? { previousName: role.previousName.trim() } : {}) };
  });
  return { reply: value.reply.trim().slice(0, 10000), characters };
}

export function mergeDiscussedCharacters(current: PictureBookCharacter[], extracted: ExtractedCharacter[]): PictureBookCharacter[] {
  const effective = extracted.filter(role => !extracted.some(other => other.name !== role.name && other.previousName === role.name));
  // characters 是最新完整名单；只沿用仍出场角色的参考形象，不累计历史名字。
  return effective.map(role => {
    const previous = role.previousName ? current.find(item => item.name === role.previousName) : undefined;
    const named = current.find(item => item.name === role.name);
    if (previous && named && previous !== named && (previous.id || previous.imageUrl) && (named.id || named.imageUrl)
      && (previous.id !== named.id || previous.imageUrl !== named.imageUrl)) throw new Error("角色名称已被占用，请为角色使用不同名字");
    const existing = previous && (previous.id || previous.imageUrl || !named) ? previous : named;
    if (existing && !role.replaceAppearance) return { ...existing, name: role.name };
    return { name: role.name, description: role.description, imageUrl: null };
  });
}
