import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { coverPrompt, seasonsBooks, seriesTitle, spreadPrompt } from "./seasons-series-data.mjs";

export const ownerId = "abei-lele-studio";
export const bookId = (slug) => `abei-seasons-${slug}`;
export const voiceId = "Chinese (Mandarin)_Warm_Girl";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const imageKey = (slug, position) => `${slug}-${position === 0 ? "cover" : String(position).padStart(2, "0")}`;
export const audioKey = (slug, position) => `${slug}:${position === 0 ? "cover" : String(position).padStart(2, "0")}`;
export const filename = (position, extension) => `${position === 0 ? "cover" : String(position).padStart(2, "0")}.${extension}`;

export function validateSeasonsInventories(images, narration) {
  if (!Array.isArray(images?.entries) || images.entries.length !== 37 || narration?.series !== seriesTitle ||
      narration.voiceId !== voiceId || narration.model !== "speech-2.8-hd") throw Error("四季系列制作清单不完整或配音音色错误");
  const imageEntries = new Map(images.entries.map((entry) => [entry.key, entry]));
  if (imageEntries.size !== 37 || !imageEntries.has("series-emblem")) throw Error("插画清单有重复或缺少系列标识");
  const expectedAudio = new Set();
  for (const book of seasonsBooks) {
    if (book.spreads.length !== 8) throw Error("四季系列必须每册八个跨页");
    for (let position = 0; position <= 8; position++) {
      const image = imageEntries.get(imageKey(book.slug, position));
      const audio = narration.entries?.[audioKey(book.slug, position)];
      const dimensions = position === 0 ? [1024, 1024] : [2048, 1024];
      const text = position === 0 ? `${seriesTitle}。${book.title}。` : book.spreads[position - 1][0];
      if (!image || image.position !== position || image.book !== book.slug ||
          !isDeepStrictEqual(image.dimensions, dimensions) || !/^[a-f0-9]{64}$/.test(image.sha256) ||
          audio?.status !== "READY" || audio.voiceId !== voiceId || audio.model !== "speech-2.8-hd" ||
          audio.text !== text || !/^[a-f0-9]{64}$/.test(audio.sha256)) throw Error(`素材或文稿不匹配：${book.slug}:${position}`);
      expectedAudio.add(audioKey(book.slug, position));
    }
  }
  if (Object.keys(narration.entries).length !== 36 || expectedAudio.size !== 36) throw Error("配音数量不正确");
}

export function buildSeasonsBookRecord(book, images, audios) {
  if (!seasonsBooks.includes(book)) throw Error("只能导入本次四季系列的指定文稿");
  const pages = Array.from({ length: 9 }, (_, position) => {
    const imageUrl = images[position], audioUrl = audios[position];
    for (const url of [imageUrl, audioUrl]) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw Error("素材地址必须为 HTTPS");
    }
    const caption = position === 0 ? book.title : book.spreads[position - 1][0];
    return {
      position, caption,
      narration: position === 0 ? `${seriesTitle}。${book.title}。` : caption,
      imagePrompt: position === 0 ? coverPrompt(book) : spreadPrompt(book, position),
      imageUrl, audioUrl, imageTaskId: null, audioTaskId: null,
    };
  });
  return {
    id: bookId(book.slug), userId: ownerId, title: book.title,
    brief: `${seriesTitle}｜${book.title}。中国的一年四季，四至八岁亲子共读。`,
    theme: "观察中国四季的景色、声音与日常生活",
    audience: "幼儿园", style: "classic-oil", aspectRatio: "1:1", isSpread: true,
    pageCount: 8, status: "COMPLETED", messages: [],
    plot: book.spreads.map(([caption]) => caption).join("\n\n"),
    characters: [{ name: "阿禾", description: "当代中国六岁女孩，黑色齐耳短发，黄色星形发夹；随季节更换日常服装。", imageUrl: null }],
    pages,
  };
}
