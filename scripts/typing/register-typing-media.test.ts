import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  inspectTypingMediaFile,
  prepareTypingImage
} from "./register-typing-media.js";

test("插图登记只接受准确的 1024×768 PNG", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "xueleai-typing-image-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const validPath = join(directory, "valid.png");
  const invalidPath = join(directory, "invalid.png");
  await sharp({
    create: {
      width: 1024,
      height: 768,
      channels: 3,
      background: "#f6f6f5"
    }
  }).png().toFile(validPath);
  await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: "#f6f6f5"
    }
  }).png().toFile(invalidPath);

  const inspected = await inspectTypingMediaFile(validPath, "ILLUSTRATION");

  assert.equal(inspected.width, 1024);
  assert.equal(inspected.height, 768);
  assert.match(inspected.hash, /^[a-f0-9]{64}$/u);
  await assert.rejects(
    inspectTypingMediaFile(invalidPath, "ILLUSTRATION"),
    /图片尺寸必须为 1024×768/u
  );
});

test("音频登记拒绝空文件并计算内容哈希", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "xueleai-typing-audio-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const emptyPath = join(directory, "empty.mp3");
  const audioPath = join(directory, "audio.mp3");
  await writeFile(emptyPath, Buffer.alloc(0));
  await writeFile(audioPath, Buffer.from("ID3-test-audio-data"));

  await assert.rejects(
    inspectTypingMediaFile(emptyPath, "BRITISH_PRONUNCIATION"),
    /音频文件为空/u
  );
  const inspected = await inspectTypingMediaFile(audioPath, "BRITISH_PRONUNCIATION");
  assert.equal(inspected.size, 19);
  assert.match(inspected.hash, /^[a-f0-9]{64}$/u);
});

test("把 imagegen 原图以 cover 方式处理为 1024×768 PNG", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "xueleai-typing-prepare-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const sourcePath = join(directory, "source.png");
  const outputPath = join(directory, "output.png");
  await sharp({
    create: {
      width: 1536,
      height: 1024,
      channels: 3,
      background: "#5b8def"
    }
  }).png().toFile(sourcePath);

  await prepareTypingImage(sourcePath, outputPath);
  const inspected = await inspectTypingMediaFile(outputPath, "ILLUSTRATION");

  assert.equal(inspected.width, 1024);
  assert.equal(inspected.height, 768);
});
