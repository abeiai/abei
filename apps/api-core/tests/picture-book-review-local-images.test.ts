import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { PictureBookSubmissionService } from "../src/picture-books/picture-book-submission.service.js";

async function fixture(run: (fixture: { service: PictureBookSubmissionService; image: Buffer; localReads: string[]; generated: () => number; setSource: (url: string) => void }) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "abei-review-local-"));
  const previousCache = process.env.IMAGE_VARIANT_CACHE_DIR;
  process.env.IMAGE_VARIANT_CACHE_DIR = join(directory, "cache");
  try {
    const image = await sharp({ create: { width: 1536, height: 1152, channels: 3, background: "#eee" } }).png().toBuffer();
    const filepath = join(directory, "cover.png");
    await writeFile(filepath, image);
    const localReads: string[] = [];
    let generated = 0;
    const snapshot = { title: "本地上传绘本", pages: [0, 1].map(position => ({ position, imageUrl: `/api/media/files/20261020-page${position}.png` })) };
    const service = Object.create(PictureBookSubmissionService.prototype) as PictureBookSubmissionService;
    Object.assign(service, {
      prisma: { pictureBookSubmission: {
        findUnique: async () => ({ id: "submission", pictureBookId: "book", status: "PENDING", coverUrl: null, snapshotHash: "hash", snapshot, pictureBook: { userId: "owner" } }),
        updateMany: async () => ({ count: 1 })
      } },
      review: async () => ({ id: "submission", coverUrl: null, book: snapshot }),
      media: {
        getLocalFile: async (filename: string) => { localReads.push(filename); return { filepath, mimeType: "image/png", size: image.length }; },
        readPictureBookStoredImage: async (url: string) => { assert.equal(url, "https://r.example/generated.png"); return { buffer: image, mimetype: "image/png" }; }
      },
      ai: {
        listImageModels: async () => [{ id: "qwen3", providerKey: "dashscope", modelName: "qwen-image-3.0", maxReferenceImages: 1 }],
        generateImage: async (_subject: unknown, input: { modelInstanceId: string; referenceImages: { dataUrl: string }[] }) => {
          generated++;
          assert.equal(input.modelInstanceId, "qwen3");
          const reference = Buffer.from(input.referenceImages[0]!.dataUrl.split(",")[1]!, "base64");
          assert.equal((await sharp(reference).metadata()).width, 1536);
          return { id: "task", images: [{ url: "https://r.example/generated.png" }] };
        }
      }
    });
    await run({ service, image, localReads, generated: () => generated, setSource: url => { snapshot.pages[0]!.imageUrl = url; } });
  } finally {
    if (previousCache === undefined) delete process.env.IMAGE_VARIANT_CACHE_DIR;
    else process.env.IMAGE_VARIANT_CACHE_DIR = previousCache;
    await rm(directory, { recursive: true, force: true });
  }
}

test("审核预览读取本地上传的原封面和内页，保持原图内容", async () => {
  await fixture(async ({ service, image, localReads }) => {
    for (const position of [0, 1]) {
      const result = await service.reviewImage("submission", position);
      assert.equal(result.mimetype, "image/png");
      assert.deepEqual(result.buffer, image);
    }
    assert.deepEqual(localReads, ["20261020-page0.png", "20261020-page1.png"]);
  });
});

test("本地上传图片可生成审核缩略图和qwen-image-3.0封面", async () => {
  await fixture(async ({ service, generated }) => {
    const preview = await service.reviewImage("submission", 0, 320);
    assert.equal((await sharp(preview.buffer).metadata()).width, 320);
    await service.generateCover("submission");
    assert.equal(generated(), 1);
  });
});

test("本地图片读取拒绝路径穿越、查询参数、非图片扩展名及任意相对路径", async () => {
  await fixture(async ({ service, localReads, setSource }) => {
    for (const url of ["/api/media/files/../secret.png", "/api/media/files/%2e%2e%2fsecret.png", "/api/media/files/cover.png?x=1", "/api/media/files/secret.txt", "/etc/secret.png", "//localhost/cover.png"]) {
      setSource(url);
      await assert.rejects(service.reviewImage("submission", 0), /绘本图片地址无效/);
    }
    assert.deepEqual(localReads, []);
  });
});

test("本地文件内容伪装为图片时仍拒绝用于审核或生成", async () => {
  await fixture(async ({ service, generated }) => {
    const filepath = join(tmpdir(), `abei-invalid-${process.pid}.png`);
    try {
      await writeFile(filepath, "not an image");
      Object.assign(service, { media: { getLocalFile: async () => ({ filepath, mimeType: "image/png", size: 12 }) } });
      await assert.rejects(service.reviewImage("submission", 0), /有效的 JPG、PNG 或 WebP/);
      await assert.rejects(service.generateCover("submission"), /封面生成失败/);
      assert.equal(generated(), 0);
    } finally { await rm(filepath, { force: true }); }
  });
});
