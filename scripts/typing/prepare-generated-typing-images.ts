import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prepareTypingImage } from "./register-typing-media.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const allowedRoot = resolve(projectRoot, "uploads/typing-content");

async function prepareGeneratedTypingImages() {
  const pairs = process.argv.slice(2);

  if (pairs.length === 0) {
    throw new Error("请提供 source::relative-output 图片路径对");
  }

  for (const pair of pairs) {
    const separator = pair.indexOf("::");
    const sourcePath = separator >= 0 ? pair.slice(0, separator) : "";
    const relativeOutput = separator >= 0 ? pair.slice(separator + 2) : "";
    const outputPath = resolve(projectRoot, relativeOutput);

    if (!sourcePath || !relativeOutput) {
      throw new Error(`图片路径对格式不正确：${pair}`);
    }

    if (!outputPath.startsWith(`${allowedRoot}/`)) {
      throw new Error(`图片输出路径超出允许目录：${relativeOutput}`);
    }

    await prepareTypingImage(sourcePath, outputPath);
  }

  console.log(`已处理 ${pairs.length} 张词汇插图。`);
}

prepareGeneratedTypingImages().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "词汇插图处理失败");
  process.exitCode = 1;
});
