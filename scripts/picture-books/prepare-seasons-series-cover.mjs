import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(await readFile(resolve(import.meta.dirname, "seasons-album-cover-manifest.json")));
const source = await readFile(resolve(root, manifest.source.file));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (digest(source) !== manifest.source.sha256) throw Error("系列封面选定母版哈希不符");
const output = await sharp(source).resize(1280, 720, { fit: "cover" })
  .webp({ quality: 92, effort: 5 }).toBuffer();
if (digest(output) !== manifest.output.sha256) throw Error("系列封面编码结果与选定版本不符");
await writeFile(resolve(root, manifest.output.file), output);
console.log(JSON.stringify({ series: "阿禾的四季", dimensions: [1280, 720], sha256: digest(output) }));
