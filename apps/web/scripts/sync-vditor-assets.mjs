import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(appDir, "node_modules", "vditor");
const targetRoot = join(appDir, "public", "vendor", "vditor");

const assetPaths = [
  "dist/index.css",
  "dist/js/lute",
  "dist/js/icons/ant.js",
  "dist/js/i18n/zh_CN.js",
  "dist/css/content-theme",
  "dist/images/emoji"
];

await rm(targetRoot, { recursive: true, force: true });

for (const assetPath of assetPaths) {
  const source = join(sourceRoot, assetPath);
  const target = join(targetRoot, assetPath);

  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
}

stdout.write("已同步 Vditor 本地静态资源\n");
