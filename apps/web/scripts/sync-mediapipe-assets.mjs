import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(appDir, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = join(appDir, "public", "vendor", "mediapipe", "wasm");

await rm(target, { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
