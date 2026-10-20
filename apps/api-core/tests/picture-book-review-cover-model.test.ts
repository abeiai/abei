import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { PictureBookSubmissionService } from "../src/picture-books/picture-book-submission.service.js";

const image = await sharp({ create: { width: 1536, height: 1152, channels: 3, background: "#f6f0e5" } }).png().toBuffer();
const models = [
  { id: "abei", providerKey: "abeiai", modelName: "Qwen-Image-2.1", maxReferenceImages: 10 },
  { id: "other-provider", providerKey: "other", modelName: "qwen-image-3.0", maxReferenceImages: 3 },
  { id: "dashscope-qwen3", providerKey: "dashscope", modelName: "qwen-image-3.0", maxReferenceImages: 3 }
];

const expectedPrompt = `请将这张绘本封面图调整为4:3的横版比例。要求如下：

1. 【风格保留】严格保持原图的绘画风格、色彩基调、笔触质感和整体氛围不变。
2. 【主体保留】画面中的核心主体（人物/动物/场景）必须完整保留，不得裁切、变形或遮挡。
3. 【文字保留】封面标题文字必须原样保留，包括字体样式、颜色、大小和位置关系，不得修改、模糊或重新生成文字内容。
4. 【扩展填充】新增的画面区域应基于原图风格进行自然延伸和补充，保持构图和谐、过渡自然，避免出现明显的拼接痕迹或空白区域。
5. 【输出质量】输出高清、无水印、无额外添加元素的完整封面图。`;

function fixture(available = models, failure?: Error, coverUrl: string | null = null, claimAllowed = true) {
  const calls: Array<{ modelInstanceId: string; prompt: string; width: number; height: number; referenceImages: unknown[] }> = [];
  const updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  let legacyCalls = 0;
  const service = Object.create(PictureBookSubmissionService.prototype) as PictureBookSubmissionService;
  Object.assign(service, {
    prisma: { pictureBookSubmission: {
      findUnique: async () => ({ id: "submission", pictureBookId: "book", status: "PENDING", snapshotHash: "hash", coverUrl,
        pictureBook: { userId: "owner" }, snapshot: { title: "云朵工厂", pages: [{ position: 0, imageUrl: "https://r.example/cover.png" }] } }),
      updateMany: async (input: typeof updates[number]) => { updates.push(input); return { count: input.data.coverToken && !claimAllowed ? 0 : 1 }; }
    } },
    media: { readPictureBookStoredImage: async () => ({ buffer: image, mimetype: "image/png" }) },
    review: async () => ({ id: "submission", coverUrl: "https://r.example/library-cover.png" }),
    ai: {
      listImageModels: async () => available,
      generatePictureBookImage: async () => { legacyCalls++; throw new Error("不应调用绘本默认模型策略"); },
      generateImage: async (subject: { userId: string }, input: typeof calls[number], options: unknown) => {
        calls.push(input);
        assert.equal(subject.userId, "owner");
        assert.deepEqual(options, { pictureBookR2: true, fixedCredits: 0 });
        if (failure) throw failure;
        return { id: "cover-task", images: [{ url: "https://r.example/library-cover.png" }] };
      }
    }
  });
  return { service, calls, updates, legacyCalls: () => legacyCalls };
}

test("审核4:3封面直接使用DashScope qwen-image-3.0并保留零扣点及R2存储", async () => {
  const { service, calls, legacyCalls } = fixture();
  await service.generateCover("submission");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.modelInstanceId, "dashscope-qwen3");
  assert.equal(calls[0]!.width, 1536);
  assert.equal(calls[0]!.height, 1152);
  assert.equal(calls[0]!.referenceImages.length, 1);
  assert.equal(calls[0]!.prompt, expectedPrompt);
  assert.equal(legacyCalls(), 0);
});

test("审核封面模型调用失败时不回退Abei 2.1", async () => {
  const { service, calls, legacyCalls } = fixture(models, new Error("provider unavailable"));
  await assert.rejects(service.generateCover("submission"), /封面生成失败/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.modelInstanceId, "dashscope-qwen3");
  assert.equal(legacyCalls(), 0);
});

test("DashScope模型未启用或不支持参考图时拒绝替用其他模型", async () => {
  for (const available of [models.slice(0, 2), [{ ...models[2]!, maxReferenceImages: 0 }]]) {
    const { service, calls, legacyCalls } = fixture(available);
    await assert.rejects(service.generateCover("submission"), /封面生成失败/);
    assert.equal(calls.length, 0);
    assert.equal(legacyCalls(), 0);
  }
});

test("已有封面默认复用，主动重新生成时保留旧图直到新图保存", async () => {
  const { service, calls, updates } = fixture(models, undefined, "https://r.example/old.png");
  await service.generateCover("submission");
  assert.equal(calls.length, 0);
  await service.generateCover("submission", true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.prompt, expectedPrompt);
  assert.equal(updates[0]!.where.coverUrl, "https://r.example/old.png");
  assert.equal(Object.hasOwn(updates[0]!.data, "coverUrl"), false);
  assert.equal(updates[1]!.data.coverUrl, "https://r.example/library-cover.png");
});

test("重新生成失败保留旧图并释放生成锁，抢锁失败不重复出图", async () => {
  const failed = fixture(models, new Error("unavailable"), "https://r.example/old.png");
  await assert.rejects(failed.service.generateCover("submission", true), /封面生成失败/);
  assert.equal(failed.updates.at(-1)!.data.coverToken, null);
  assert.ok(failed.updates.every(update => !Object.hasOwn(update.data, "coverUrl")));
  const concurrent = fixture(models, undefined, "https://r.example/old.png", false);
  await concurrent.service.generateCover("submission", true);
  assert.equal(concurrent.calls.length, 0);
});
