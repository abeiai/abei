/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AudioService } from "../src/audio/audio.service.js";

test("删除本地音频资产时同时删除实际存储文件", async () => {
  const uploadRoot = await mkdtemp(join(tmpdir(), "xueleai-audio-cleanup-"));
  const audioDirectory = join(uploadRoot, "audio");
  const filename = "read-along.mp3";
  const filepath = join(audioDirectory, filename);
  const originalUploadDir = process.env.UPLOAD_DIR;

  await mkdir(audioDirectory, { recursive: true });
  await writeFile(filepath, Buffer.from("audio"));
  process.env.UPLOAD_DIR = uploadRoot;

  try {
    let deletedRows = 0;
    const service = new AudioService();
    Object.assign(service as unknown as Record<string, unknown>, {
      prisma: {
        audioAsset: {
          findFirst: async () => ({
            id: "audio-asset-1",
            objectKey: filename,
            storageProvider: "LOCAL"
          }),
          deleteMany: async () => {
            deletedRows += 1;
            return { count: 1 };
          }
        },
        audioTask: {
          count: async () => 0
        }
      } as any
    });

    await service.deleteAudioAsset("user-1", "audio-asset-1");

    assert.equal(existsSync(filepath), false);
    assert.equal(deletedRows, 1);
  } finally {
    if (originalUploadDir === undefined) {
      delete process.env.UPLOAD_DIR;
    } else {
      process.env.UPLOAD_DIR = originalUploadDir;
    }
    await rm(uploadRoot, { force: true, recursive: true });
  }
});
