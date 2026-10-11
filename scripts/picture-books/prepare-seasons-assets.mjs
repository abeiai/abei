import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { artDirection, coverPrompt, seasonsBooks, seriesAudience, seriesTitle, spreadPrompt } from "./seasons-series-data.mjs";
import selectedSources from "./seasons-selected-sources.json" with { type: "json" };

const root = path.resolve(import.meta.dirname, "../..");
const publicDir = path.join(root, "apps/web/public/picture-book-demos/seasons");
const manifestPath = path.join(import.meta.dirname, "seasons-generation-manifest.json");
const reference = "/var/folders/d0/dy67b1hd0_ldk7b5gzp8y8qh0000gn/T/codex-clipboard-3830c26b-8dbf-4b81-b864-02d1d6d102d5.png";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const entries = [];
let repairs = {};
try { repairs = JSON.parse(await readFile(path.join(import.meta.dirname, "seasons-image-repairs.json"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
let narration = null;
try { narration = JSON.parse(await readFile(path.join(import.meta.dirname, "seasons-narration-manifest.json"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const audioFor = (slug, name) => narration?.entries?.[`${slug}:${name}`]?.status === "READY" ? `${slug}/${name}.mp3` : null;

await mkdir(publicDir, { recursive: true });
for (const book of seasonsBooks) {
  const bookDir = path.join(publicDir, book.slug);
  await mkdir(bookDir, { recursive: true });
  for (let position = 0; position <= 8; position++) {
    const name = position === 0 ? "cover" : String(position).padStart(2, "0");
    const key = `${book.slug}-${name}`;
    const source = selectedSources[key];
    if (!source) throw new Error(`缺少已选定图片：${key}`);
    const sourceBytes = await readFile(path.resolve(root, source));
    const sourceMeta = await sharp(sourceBytes).metadata();
    const width = position === 0 ? 1024 : 2048;
    const height = 1024;
    const output = path.join(bookDir, `${name}.webp`);
    const bytes = await sharp(sourceBytes).resize(width, height, { fit: "fill" }).webp({ quality: 90, effort: 5 }).toBuffer();
    await writeFile(output, bytes);
    const entry = {
      key, book: book.slug, position, caption: position === 0 ? null : book.spreads[position - 1][0],
      prompt: position === 0 ? coverPrompt(book) : spreadPrompt(book, position),
      references: position === 0 ? [
        { path: reference, role: "painting style only" },
        { path: selectedSources["series-emblem"], role: "approved logo identity" },
      ] : [
        { path: reference, role: "painting style only" },
        { path: selectedSources[`${book.slug}-cover`], role: "character identity and seasonal clothing only" },
      ],
      source, sourceDimensions: [sourceMeta.width, sourceMeta.height], sourceSha256: digest(sourceBytes),
      output: path.relative(root, output), dimensions: [width, height], sha256: digest(bytes),
    };
    const repair = repairs[key];
    if (repair && (repair.sourceSha256 !== entry.sourceSha256 || repair.sha256 !== entry.sha256)) throw new Error(`修补图与选定版本不符：${key}`);
    entries.push(repair ? { ...entry, ...repair } : entry);
  }
}

const logoSource = selectedSources["series-emblem"];
const logoBytes = await readFile(logoSource);
const logoMeta = await sharp(logoBytes).metadata();
const logoOutput = path.join(publicDir, "series-emblem.png");
await writeFile(logoOutput, logoBytes);
entries.push({
  key: "series-emblem", role: "shared series identity source; cover wordmark upper-left and painted seasonal ring lower-right",
  source: logoSource, sourceDimensions: [logoMeta.width, logoMeta.height], sourceSha256: digest(logoBytes),
  output: path.relative(root, logoOutput), dimensions: [logoMeta.width, logoMeta.height], sha256: digest(logoBytes),
});

const books = seasonsBooks.map((book) => ({
  slug: book.slug, title: book.title, color: book.color, cover: `${book.slug}/cover.webp`, coverAudio: audioFor(book.slug, "cover"),
  spreads: book.spreads.map(([caption], index) => {
    const name = String(index + 1).padStart(2, "0");
    return { image: `${book.slug}/${name}.webp`, audio: audioFor(book.slug, name), caption };
  }),
}));
await writeFile(path.join(publicDir, "books.js"), `/* global window */\nwindow.SEASONS_BOOKS = ${JSON.stringify({ seriesTitle, seriesAudience, books }, null, 2)};\n`);
await writeFile(manifestPath, JSON.stringify({
  seriesTitle, seriesAudience, status: "local draft; not published", format: "square cover + eight continuous 2:1 double-page spreads per book",
  artDirection, typography: {
    logo: "设计感现代几何黑体字标独立放在左上角，四季油画色环与禾苗图标单独放在右下角；四册保持统一位置、尺度与安全边距。",
    cover: "主书名为逐字定制的厚涂油画展示字；与黑体标识保留鲜明笔触和位置对比。",
    opening: "首个跨页的诗句放在画面外的留白区，用稳重的黑体较大字号排两行；首行提亮、行距疏朗，之后七页收为统一的阅读字号。",
  }, entries,
}, null, 2) + "\n");
console.log(`已准备 ${books.length} 册、${entries.length - 1} 张封面与跨页图、1 个系列标识：${publicDir}`);
