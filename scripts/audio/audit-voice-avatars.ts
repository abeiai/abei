import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { voiceAvatarVersion } from "./voice-avatar-renderer.js";

interface ManifestEntry {
  filename: string;
  id: string;
  name: string;
  promptSha256: string;
  spec: { visualIdentityKey: string };
}

interface ImageAudit {
  exactSha256: string;
  faceHash: bigint;
  filename: string;
  fullHash: bigint;
  height: number;
  id: string;
  name: string;
  width: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../..");
const buildDir = join(workspaceRoot, "tmp/voice-avatar-build", voiceAvatarVersion);
const generatedDir = join(buildDir, "generated");
const requireAll = process.argv.includes("--require-all");

async function main() {
  const manifest = JSON.parse(await readFile(join(buildDir, "manifest.json"), "utf8")) as ManifestEntry[];
  const files = await readdir(generatedDir);
  const pathsByStem = new Map(files.map((file) => [file.slice(0, -extname(file).length), join(generatedDir, file)]));
  const missing = manifest.filter((entry) => !pathsByStem.has(entry.filename)).map((entry) => entry.id);
  const audits: ImageAudit[] = [];
  const invalid: Array<{ id: string; message: string }> = [];

  await runLimited(manifest.filter((entry) => pathsByStem.has(entry.filename)), 8, async (entry) => {
    try {
      const path = pathsByStem.get(entry.filename)!;
      const source = await readFile(path);
      const metadata = await sharp(source).metadata();
      if (!metadata.width || !metadata.height) throw new Error("无法读取图片尺寸");
      if (metadata.width < 512 || metadata.height < 512) throw new Error(`图片尺寸过小: ${metadata.width}x${metadata.height}`);
      const normalized = await sharp(source)
        .rotate()
        .resize(256, 256, { fit: "cover", position: "centre" })
        .png()
        .toBuffer();
      const faceCrop = await sharp(normalized)
        .extract({ left: 40, top: 20, width: 176, height: 196 })
        .png()
        .toBuffer();
      const [fullHash, faceHash] = await Promise.all([
        differenceHash(sharp(normalized)),
        differenceHash(sharp(faceCrop))
      ]);
      audits.push({
        id: entry.id,
        name: entry.name,
        filename: entry.filename,
        width: metadata.width,
        height: metadata.height,
        exactSha256: createHash("sha256").update(source).digest("hex"),
        fullHash,
        faceHash
      });
    } catch (error) {
      invalid.push({ id: entry.id, message: error instanceof Error ? error.message : String(error) });
    }
  });

  audits.sort((left, right) => left.id.localeCompare(right.id));
  const exactGroups = duplicateGroups(audits, (item) => item.exactSha256)
    .map((group) => group.map((item) => ({ id: item.id, name: item.name })));
  const similarityCandidates: Array<{
    faceDistance: number;
    firstId: string;
    firstName: string;
    fullDistance: number;
    secondId: string;
    secondName: string;
  }> = [];
  let minimumFaceDistance = 64;

  for (let firstIndex = 0; firstIndex < audits.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < audits.length; secondIndex += 1) {
      const first = audits[firstIndex]!;
      const second = audits[secondIndex]!;
      const faceDistance = hammingDistance(first.faceHash, second.faceHash);
      minimumFaceDistance = Math.min(minimumFaceDistance, faceDistance);
      if (faceDistance > 4) continue;
      similarityCandidates.push({
        firstId: first.id,
        firstName: first.name,
        secondId: second.id,
        secondName: second.name,
        faceDistance,
        fullDistance: hammingDistance(first.fullHash, second.fullHash)
      });
    }
  }
  similarityCandidates.sort((left, right) => left.faceDistance - right.faceDistance || left.fullDistance - right.fullDistance);
  const nearDuplicates = similarityCandidates.filter((item) => item.faceDistance <= 3);
  const manualReviewCandidates = similarityCandidates.filter((item) => item.faceDistance === 4);

  const report = {
    version: voiceAvatarVersion,
    expected: manifest.length,
    generated: audits.length,
    uniquePrompts: new Set(manifest.map((entry) => entry.promptSha256)).size,
    uniqueVisualIdentities: new Set(manifest.map((entry) => entry.spec.visualIdentityKey)).size,
    uniqueFiles: new Set(audits.map((item) => item.exactSha256)).size,
    minimumFaceHashDistance: minimumFaceDistance,
    missing,
    invalid,
    exactDuplicateGroups: exactGroups,
    nearDuplicates,
    manualReviewCandidates
  };
  await mkdir(buildDir, { recursive: true });
  await writeFile(join(buildDir, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ...report,
    nearDuplicates: nearDuplicates.slice(0, 20),
    manualReviewCandidates: manualReviewCandidates.slice(0, 20)
  }, null, 2));

  if (requireAll && (missing.length > 0 || invalid.length > 0 || exactGroups.length > 0 || nearDuplicates.length > 0)) {
    process.exitCode = 2;
  }
}

async function differenceHash(image: sharp.Sharp) {
  const pixels = await image.resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer();
  let hash = 0n;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      hash <<= 1n;
      if (pixels[row * 9 + column]! > pixels[row * 9 + column + 1]!) hash |= 1n;
    }
  }
  return hash;
}

function hammingDistance(first: bigint, second: bigint) {
  let value = first ^ second;
  let distance = 0;
  while (value > 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

function duplicateGroups<T>(items: readonly T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

async function runLimited<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]!);
    }
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
