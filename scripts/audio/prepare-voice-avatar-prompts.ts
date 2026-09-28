import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { cosyVoiceSystemVoices } from "../../apps/api-core/src/audio/cosyvoice-system-voices.js";
import { minimaxSystemVoices } from "../../apps/api-core/src/audio/minimax-system-voices.js";
import { getPrismaClient } from "../../packages/database/src/index.js";
import {
  classifyVoice,
  type VoiceClassificationInput
} from "./voice-library-classification.js";
import {
  avatarPromptForVoice,
  avatarSpecForVoice,
  voiceAvatarFilename,
  voiceAvatarVersion,
  type VoiceAvatarSpec
} from "./voice-avatar-renderer.js";

interface AvatarTarget {
  id: string;
  role: VoiceClassificationInput;
  source: "cosyvoice-system" | "minimax-system" | "database";
}

interface AvatarManifestEntry {
  accent: string;
  ageCategory: string;
  archetype: string;
  demographic: string;
  filename: string;
  gender: string;
  id: string;
  language: string;
  name: string;
  prompt: string;
  promptSha256: string;
  signature: string;
  source: AvatarTarget["source"];
  spec: VoiceAvatarSpec;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../..");
const buildDir = join(workspaceRoot, "tmp/voice-avatar-build", voiceAvatarVersion);

dotenv.config({ path: process.env.VOICE_AVATAR_ENV_FILE || join(workspaceRoot, ".env"), quiet: true });

async function main() {
  const prisma = getPrismaClient();
  try {
    const databaseVoices = await prisma.voiceAsset.findMany({ orderBy: { createdAt: "asc" } });
    const targets: AvatarTarget[] = [
      ...cosyVoiceSystemVoices.map((role) => ({
        id: `cosy-${role.providerVoiceId}`,
        role: role as VoiceClassificationInput,
        source: "cosyvoice-system" as const
      })),
      ...minimaxSystemVoices.map((role) => ({
        id: `minimax-${role.providerVoiceId}`,
        role: role as VoiceClassificationInput,
        source: "minimax-system" as const
      })),
      ...databaseVoices.map((role) => ({
        id: `asset-${role.id}`,
        role: {
          providerVoiceId: role.providerVoiceId,
          name: role.name,
          language: role.language,
          accent: role.accent,
          gender: role.gender,
          ageCategory: role.ageCategory,
          description: role.description
        },
        source: "database" as const
      }))
    ];

    const manifest = targets.map(toManifestEntry).sort((left, right) => left.id.localeCompare(right.id));
    assertUnique(manifest, (entry) => entry.id, "角色 ID");
    assertUnique(manifest, (entry) => entry.filename, "输出文件名");
    assertUnique(manifest, (entry) => entry.signature, "身份签名");
    assertUnique(manifest, (entry) => entry.promptSha256, "完整提示词");
    assertUnique(manifest, (entry) => entry.spec.visualIdentityKey, "可见身份特征组合");

    const sample = representativeSample(manifest, 24);
    await mkdir(join(buildDir, "generated"), { recursive: true });
    await Promise.all([
      writeJson(join(buildDir, "manifest.json"), manifest),
      writeJson(join(buildDir, "sample-24-manifest.json"), sample),
      writeJsonLines(join(buildDir, "prompts.jsonl"), manifest),
      writeJsonLines(join(buildDir, "sample-24-prompts.jsonl"), sample)
    ]);

    const counts = countBy(manifest, (entry) => entry.source);
    const report = {
      version: voiceAvatarVersion,
      model: "gpt-image-2",
      generationSize: "1024x1024",
      deliverySize: "512x512",
      total: manifest.length,
      uniquePrompts: new Set(manifest.map((entry) => entry.promptSha256)).size,
      uniqueVisualIdentities: new Set(manifest.map((entry) => entry.spec.visualIdentityKey)).size,
      sources: counts,
      sample: sample.map((entry) => ({
        id: entry.id,
        name: entry.name,
        language: entry.language,
        accent: entry.accent,
        demographic: entry.demographic,
        archetype: entry.archetype,
        filename: entry.filename
      }))
    };
    await writeJson(join(buildDir, "report.json"), report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

function toManifestEntry(target: AvatarTarget): AvatarManifestEntry {
  const classification = classifyVoice(target.role);
  const spec = avatarSpecForVoice(target.id, classification, target.role);
  const prompt = avatarPromptForVoice(spec, target.role);
  return {
    id: target.id,
    source: target.source,
    name: target.role.name,
    language: classification.language,
    accent: classification.accent,
    gender: classification.gender,
    ageCategory: classification.ageCategory,
    demographic: spec.demographic,
    archetype: spec.visualArchetype,
    signature: spec.signature,
    spec,
    prompt,
    promptSha256: createHash("sha256").update(prompt).digest("hex"),
    filename: voiceAvatarFilename(target.id, spec)
  };
}

function representativeSample(entries: readonly AvatarManifestEntry[], size: number) {
  const selected: AvatarManifestEntry[] = [];
  const selectedIds = new Set<string>();
  const ordered = [...entries].sort((left, right) => {
    const leftHash = createHash("sha256").update(`sample:${left.id}`).digest("hex");
    const rightHash = createHash("sha256").update(`sample:${right.id}`).digest("hex");
    return leftHash.localeCompare(rightHash);
  });
  const selectors = [
    (entry: AvatarManifestEntry) => `${entry.demographic}|${entry.archetype}`,
    (entry: AvatarManifestEntry) => `${entry.language}|${entry.gender}`,
    (entry: AvatarManifestEntry) => `${entry.accent}|${entry.ageCategory}`
  ];

  for (const selector of selectors) {
    const groups = new Set<string>();
    for (const entry of ordered) {
      if (selected.length >= size) break;
      const group = selector(entry);
      if (groups.has(group) || selectedIds.has(entry.id)) continue;
      groups.add(group);
      selectedIds.add(entry.id);
      selected.push(entry);
    }
    if (selected.length >= size) break;
  }
  for (const entry of ordered) {
    if (selected.length >= size) break;
    if (selectedIds.has(entry.id)) continue;
    selectedIds.add(entry.id);
    selected.push(entry);
  }
  return selected;
}

function assertUnique<T>(items: readonly T[], keyFor: (item: T) => string, label: string) {
  const seen = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    throw new Error(`${label}存在 ${duplicates.length} 个重复值: ${duplicates.slice(0, 3).map(([key]) => key).join(", ")}`);
  }
}

function countBy<T>(items: readonly T[], keyFor: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFor(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonLines(path: string, entries: readonly AvatarManifestEntry[]) {
  const content = entries.map((entry) => JSON.stringify({
    model: "gpt-image-2",
    prompt: entry.prompt,
    use_case: "stylized-concept",
    size: "1024x1024",
    quality: "high",
    output_format: "png",
    out: `${entry.filename}.png`
  })).join("\n");
  await writeFile(path, `${content}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
