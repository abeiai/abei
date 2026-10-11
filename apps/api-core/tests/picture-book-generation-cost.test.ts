import assert from "node:assert/strict";
import test from "node:test";
import { AiService } from "../src/ai/ai.service.js";
import { PictureBookService } from "../src/picture-books/picture-book.service.js";
import { PictureBookController } from "../src/picture-books/picture-book.controller.js";

function books() {
  const service = Object.create(PictureBookService.prototype) as any;
  Object.assign(service, {
    get: async (userId: string) => { assert.equal(userId, "owner"); return { aspectRatio: "16:9", characters: [{ id: "preset:boy" }, { name: "旁白" }], pages: [{ position: 1, narration: "已保存的文稿" }] }; },
    prisma: { aiScenario: { findMany: async () => [{ costCredits: 3 }, { costCredits: 1 }] } },
    aiService: { quotePictureBookImage: async (input: unknown) => { assert.deepEqual(input, { width: 1536, height: 864, referenceImageCount: 2 }); return { credits: 2, fallbackCredits: 8 }; } },
    audioService: {
      listVoiceAssets: async () => ({ defaultVoice: { voiceAssetId: null, systemVoiceId: "default-voice" }, systemVoices: [] }),
      prepareDialogueTts: async (context: unknown, input: unknown) => { assert.deepEqual(context, { userId: "owner", learnerId: null }); assert.deepEqual(input, { text: "新的讲解文稿", voiceValue: "voice:selected", speed: 1 }); return { credits: 5 }; }
    }
  });
  return service;
}

test("分镜预估合计创作与内容检查费用，尚未配置的场景沿用零点默认", async () => {
  const service = books();
  assert.deepEqual(await service.generationCost("owner", "book", { kind: "outline" }), { credits: 4 });
  service.prisma.aiScenario.findMany = async () => [];
  assert.deepEqual(await service.generationCost("owner", "book", { kind: "outline" }), { credits: 0 });
});

test("空白分镜免费且不会调用 AI 费用读取", async () => {
  const service = books();
  service.prisma.aiScenario.findMany = async () => { throw new Error("不应调用 AI"); };
  assert.deepEqual(await service.generationCost("owner", "book", { kind: "blank" }), { credits: 0 });
});

test("图片预估使用绘本比例、风格与已绑定角色参考图，返回后备模型费用", async () => {
  assert.deepEqual(await books().generationCost("owner", "book", { kind: "image", position: 1 }), { credits: 2, fallbackCredits: 8 });
});

test("没有实际参考图的旧版角色与已删除角色不会增加图片预估费用", async () => {
  const service = books();
  service.get = async () => ({ aspectRatio: "1:1", style: "watercolor", characters: [{ id: "preset:fox" }, { id: "deleted-role" }], pages: [{ position: 0 }] });
  service.prisma.pictureBookCharacter = { findMany: async () => [] };
  service.aiService.quotePictureBookImage = async (input: unknown) => { assert.deepEqual(input, { width: 1024, height: 1024, referenceImageCount: 1 }); return { credits: 2 }; };
  assert.deepEqual(await service.generationCost("owner", "book", { kind: "image", position: 0 }), { credits: 2 });
});

test("语音预估使用未保存的最新文稿与用户选定音色，不创建或扣费", async () => {
  assert.deepEqual(await books().generationCost("owner", "book", { kind: "audio", position: 1, narration: "新的讲解文稿", voiceAssetId: "selected" }), { credits: 5 });
});

test("译文语音预估使用对应语种文稿，缺失语种不回退原文", async () => {
  const service = books();
  service.get = async () => ({ pages: [{ position: 1, narration: "原文", translations: [{ language: "en", caption: "New story" }] }] });
  service.audioService.prepareDialogueTts = async (_context: unknown, input: { text: string }) => {
    assert.equal(input.text, "New story"); return { credits: 2 };
  };
  assert.deepEqual(await service.generationCost("owner", "book", { kind: "audio", position: 1, language: "en" }), { credits: 2 });
  await assert.rejects(service.generationCost("owner", "book", { kind: "audio", position: 1, language: "ja" }), /填写讲解语音文稿/);
});

test("作品不可访问或页面不存在时不会读取费用", async () => {
  const service = books();
  await assert.rejects(service.generationCost("owner", "book", { kind: "image", position: 20 }), /页面/);
  service.get = async () => { throw new Error("绘本作品不存在"); };
  await assert.rejects(service.generationCost("other", "book", { kind: "outline" }), /作品不存在/);
});

test("图片报价与实际计费函数一致，包含参考图费用和模型参考数上限", async () => {
  const service = Object.create(AiService.prototype) as any;
  Object.assign(service, {
    listImageModels: async () => [{ id: "primary", providerKey: "abeiai", modelName: "Qwen-Image-2.1", maxReferenceImages: 3 }, { id: "fallback", providerKey: "dashscope", modelName: "qwen-image-3.0", maxReferenceImages: 2 }],
    getImageGenerationModel: async (id: string) => ({ providerModelName: id === "primary" ? "Qwen-Image-2.1" : "qwen-image-3.0", pricingMode: "IMAGES", pricingUnit: "IMAGE", pricingConfig: null, inputPrice: "0.01", outputPrice: "0.02" })
  });
  assert.deepEqual(await service.quotePictureBookImage({ width: 1024, height: 1024, referenceImageCount: 5 }), { credits: 5, fallbackCredits: 4 });
  service.listImageModels = async () => [];
  await assert.rejects(service.quotePictureBookImage({}), /默认图片模型/);
});

test("费用预估接口要求登录并限定为本人账号", async () => {
  let accessed = false;
  const controller = new PictureBookController({ generationCost: async () => { accessed = true; } } as never, { me: async () => { throw new Error("请登录"); } } as never, {} as never);
  await assert.rejects(controller.generationCost({}, "book", { kind: "outline" }), /登录/);
  assert.equal(accessed, false);
});
