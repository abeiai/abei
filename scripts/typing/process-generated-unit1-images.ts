import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prepareTypingImage } from "./register-typing-media.js";
import { slugifyTypingItem } from "./typing-media-manifest.js";

interface SourceImage {
  order: number;
  path: string;
  text: string;
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceManifestPath = resolve(
  projectRoot,
  "uploads/typing-content/yl-7a/unit-01/image-generation-sources.json"
);

async function processGeneratedUnit1Images() {
  const sources = JSON.parse(await readFile(sourceManifestPath, "utf8")) as SourceImage[];

  if (sources.length !== 40 || new Set(sources.map((source) => source.order)).size !== 40) {
    throw new Error("Unit 1 图片来源清单必须包含 40 个唯一词条");
  }

  for (const source of sources.sort((left, right) => left.order - right.order)) {
    await access(source.path);
    const filename = `${String(source.order).padStart(2, "0")}-${slugifyTypingItem(source.text)}.png`;
    const outputPath = resolve(
      projectRoot,
      "uploads/typing-content/yl-7a/unit-01/images",
      filename
    );
    await prepareTypingImage(source.path, outputPath);
    console.log(`${source.order}/40 ${source.text}：${outputPath}`);
  }
}

processGeneratedUnit1Images().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unit 1 图片处理失败");
  process.exitCode = 1;
});

