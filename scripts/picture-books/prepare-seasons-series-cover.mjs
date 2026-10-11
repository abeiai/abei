import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "../..");
const base = resolve(root, "apps/web/public/picture-book-demos/seasons");
const names = ["spring", "summer", "autumn", "winter"];
const tileSize = 276;
const gap = 16;
const left = (1280 - names.length * tileSize - (names.length - 1) * gap) / 2;
const tiles = await Promise.all(names.map(async (name, index) => ({
  input: await sharp(resolve(base, name, "cover.webp")).resize(tileSize, tileSize).toBuffer(),
  left: Math.round(left + index * (tileSize + gap)),
  top: 310,
})));
const logo = await sharp(await readFile(resolve(base, "series-emblem.png"))).resize({ width: 620 }).toBuffer();
const background = Buffer.from(`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="paper" x2="1" y2="1"><stop stop-color="#f4f8ee"/><stop offset=".34" stop-color="#fff5df"/><stop offset=".7" stop-color="#f8eee5"/><stop offset="1" stop-color="#e9f2fb"/></linearGradient></defs><rect width="1280" height="720" fill="url(#paper)"/><path d="M0 635 C260 605 430 681 720 635 S1040 598 1280 641" fill="none" stroke="#d3ddcb" stroke-width="2"/></svg>`);
await sharp(background).composite([{ input: logo, left: 330, top: 49 }, ...tiles]).webp({ quality: 92, effort: 5 }).toFile(resolve(base, "series-cover.webp"));
console.log("已准备《阿禾的四季》16:9 系列封面");
