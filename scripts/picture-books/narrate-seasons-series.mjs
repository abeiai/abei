import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { seasonsBooks, seriesTitle } from "./seasons-series-data.mjs";

const root = resolve(import.meta.dirname, "../..");
const outputDir = resolve(root, "apps/web/public/picture-book-demos/seasons");
const manifestFile = resolve(import.meta.dirname, "seasons-narration-manifest.json");
const modelId = "cmupm4wcp005izy8oleycz6i8";
const modelName = "speech-2.8-hd";
const voiceId = "Chinese (Mandarin)_Warm_Girl";
const speed = 0.94;
const sampleRate = 32000;
const pronunciationByKey = {
  "spring:07": ["排成行/(pai2)(cheng2)(hang2)"],
  "summer:08": ["长长/(chang2)(chang2)"],
  "autumn:04": ["小扇子/(xiao3)(shan4)(zi5)"],
  "winter:08": ["藏着/(cang2)(zhe5)"],
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const at = arg.indexOf("="); return [arg.slice(0, at), arg.slice(at + 1)]; }));
const only = args["--only"] || null;
const limit = args["--limit"] ? Number(args["--limit"]) : 36;
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 36) throw new Error("--limit 应为 1—36");

// 从 abei 本地配置读取数据库密码，再由项目现有 AudioService 解密已配置的服务商密钥。
// 不将任何密钥写入生成记录、音频文件或控制台。
process.loadEnvFile(resolve(root, ".env"));
if (!process.env.POSTGRES_PASSWORD) throw new Error("缺少 abei 数据库配置");
process.env.DATABASE_URL = `postgresql://abei:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@127.0.0.1:3604/abei?schema=public`;
const requireApi = createRequire(resolve(root, "apps/api-core/package.json"));
requireApi("reflect-metadata");
const { AudioService } = await import(pathToFileURL(resolve(root, "apps/api-core/dist/audio/audio.service.js")).href);
const audio = new AudioService();
const model = await audio.getAudioModelById(modelId, "TTS");
if (model.providerKey !== "minimax_audio" || model.adapterType !== "MINIMAX_AUDIO" || model.modelName !== modelName) {
  throw new Error("abei 中已配置的 MiniMax HD 模型与任务要求不一致");
}
const endpoint = new URL("/v1/t2a_v2", model.baseUrl);
if (endpoint.protocol !== "https:" || !["api.minimaxi.com", "api.minimax.io"].includes(endpoint.hostname)) {
  throw new Error("MiniMax API 地址不在允许范围内");
}
const apiKey = audio.resolveProviderApiKey(model);
if (!apiKey) throw new Error("MiniMax API 密钥未配置");

const pages = seasonsBooks.flatMap((book) => [
  { key: `${book.slug}:cover`, slug: book.slug, position: 0, name: "cover", text: `${seriesTitle}。${book.title}。` },
  ...book.spreads.map(([caption], index) => ({
    key: `${book.slug}:${String(index + 1).padStart(2, "0")}`, slug: book.slug,
    position: index + 1, name: String(index + 1).padStart(2, "0"), text: caption,
  })),
]);
if (only && !pages.some((page) => page.key === only)) throw new Error(`未知页面：${only}`);

let manifest;
try { manifest = JSON.parse(await readFile(manifestFile, "utf8")); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  manifest = {
    series: seriesTitle, provider: "minimax_audio", model: modelName, voiceId, speed, sampleRate,
    createdAt: new Date().toISOString(), pronunciationReview: [
      { key: "spring:07", word: "排成行", targetPinyin: "pái chéng háng", method: "MiniMax pronunciation_dict", result: "已加读音规则；人工听审待完成" },
      { key: "summer:08", word: "长长", targetPinyin: "cháng cháng", method: "MiniMax pronunciation_dict", result: "已加读音规则；人工听审待完成" },
      { key: "autumn:04", word: "小扇子", targetPinyin: "xiǎo shàn zi", method: "MiniMax pronunciation_dict", result: "已加读音规则；人工听审待完成" },
      { key: "winter:08", word: "藏着", targetPinyin: "cáng zhe", method: "MiniMax pronunciation_dict", result: "已加读音规则；人工听审待完成" },
    ],
    entries: {},
  };
}
if (manifest.series !== seriesTitle || manifest.provider !== "minimax_audio" || manifest.model !== modelName ||
    manifest.voiceId !== voiceId || manifest.speed !== speed || manifest.sampleRate !== sampleRate) {
  throw new Error("已有配音清单的模型、音色或参数不匹配");
}
const save = async () => {
  await writeFile(`${manifestFile}.tmp`, JSON.stringify(manifest, null, 2) + "\n");
  await rename(`${manifestFile}.tmp`, manifestFile);
};
await save();

let generated = 0;
for (const page of pages.filter((item) => !only || item.key === only)) {
  const pronunciation = pronunciationByKey[page.key] ?? [];
  const inputHash = sha256(JSON.stringify([page.key, page.text, voiceId, modelName, speed, sampleRate, pronunciation]));
  const output = resolve(outputDir, page.slug, `${page.name}.mp3`);
  let entry = manifest.entries[page.key];
  if (entry) {
    if (entry.inputHash !== inputHash || entry.text !== page.text) throw new Error(`文稿或参数变化：${page.key}`);
    if (entry.status === "READY") {
      const bytes = await readFile(output);
      if (sha256(bytes) !== entry.sha256) throw new Error(`已完成音频哈希不一致：${page.key}`);
      continue;
    }
    // REQUESTING 表示付费请求可能已完成，但本地还没有可信回执，不自动重发。
    throw new Error(`音频状态未确认，停止重试：${page.key} (${entry.status})`);
  }
  if (generated >= limit) break;
  await mkdir(resolve(outputDir, page.slug), { recursive: true });
  entry = manifest.entries[page.key] = {
    key: page.key, position: page.position, text: page.text, inputHash,
    voiceId, model: modelName, speed, pronunciation, status: "REQUESTING", requestedAt: new Date().toISOString(),
  };
  await save();
  const body = {
    model: modelName, text: page.text, stream: false, output_format: "hex",
    voice_setting: { voice_id: voiceId, speed, vol: 1, pitch: 0 },
    audio_setting: { sample_rate: sampleRate, bitrate: 128000, format: "mp3", channel: 1 },
    ...(pronunciation.length ? { pronunciation_dict: { tone: pronunciation } } : {}),
  };
  const response = await fetch(endpoint, {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(100000),
  });
  const result = await response.json().catch(() => null);
  const status = result?.base_resp?.status_code;
  if (!response.ok || status !== 0) {
    Object.assign(entry, { status: "FAILED_RESPONSE", httpStatus: response.status,
      providerStatus: status ?? null, providerMessage: result?.base_resp?.status_msg ?? null });
    await save();
    throw new Error(`MiniMax 返回失败：${page.key}，HTTP ${response.status}，状态 ${status ?? "未知"}`);
  }
  const audioHex = result?.data?.audio;
  if (typeof audioHex !== "string" || !/^(?:[0-9a-fA-F]{2})+$/.test(audioHex)) throw new Error(`音频格式无法验证：${page.key}`);
  const bytes = Buffer.from(audioHex, "hex");
  if (bytes.length < 1000) throw new Error(`音频过短：${page.key}`);
  await writeFile(`${output}.tmp`, bytes);
  await rename(`${output}.tmp`, output);
  const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", output], { encoding: "utf8" }).trim());
  Object.assign(entry, {
    status: "READY", output: `apps/web/public/picture-book-demos/seasons/${page.slug}/${page.name}.mp3`,
    sha256: sha256(bytes), sizeBytes: bytes.length, durationSeconds: duration,
    requestId: result?.trace_id ?? result?.request_id ?? null,
    usageCharacters: result?.extra_info?.usage_characters ?? page.text.length,
    completedAt: new Date().toISOString(),
  });
  await save();
  generated++;
  console.log(JSON.stringify({ ready: page.key, durationSeconds: duration, completed: Object.values(manifest.entries).filter((item) => item.status === "READY").length, total: pages.length }));
  if (generated < limit) await new Promise((resolveDelay) => setTimeout(resolveDelay, 3000));
}
