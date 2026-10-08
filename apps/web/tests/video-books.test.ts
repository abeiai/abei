import assert from "node:assert/strict";
import test from "node:test";
import { createVideoBookProject, getVideoBookTask, pendingVideoBookPages, validateVideoBookReferences, validateVideoBookSettings, videoBookAttachment, videoBookFrame, videoBookModels, videoBookPrompt, videoBookRequest } from "../src/lib/video-books.js";
import type { ExperienceVideoModel } from "../src/lib/experience-api.js";
import type { PictureBookGuide } from "../src/lib/picture-book-guide.js";

const model: ExperienceVideoModel = { id: "wan", displayName: "图生视频", providerName: "DashScope", providerPresetName: "通义千问", modelName: "wan2.7-i2v",
  capabilityTags: ["IMAGE_TO_VIDEO"], aliases: [], maxReferenceFiles: 3, acceptedReferenceTypes: ["image/*", "audio/*", "video/*"], supportedRatios: ["16:9", "9:16"],
  defaultDuration: 5, supportedDurations: [5, 10], defaultResolution: "高清 720P", supportedResolutions: ["高清 720P"], supportsPromptRewrite: false, isMock: false };
const guide = { id: "guide", title: "小熊的故事", pdfUrl: "/original.pdf", pdfName: "小熊.pdf", pages: [
  { pageNumber: 1, imageUrl: "/first.png", sourceText: "小熊坐在树下。" },
  { pageNumber: 2, imageUrl: "/second.png", sourceText: "小熊和朋友一起看星星。" }
] } as PictureBookGuide;
const audio = { id: "voice", name: "朗读.mp3", type: "audio" as const, mimeType: "audio/mpeg", size: 1024, dataUrl: "data:audio/mpeg;base64,AA==" };
const image = { id: "image", name: "尾帧.png", type: "image" as const, mimeType: "image/png", size: 2048, dataUrl: "data:image/png;base64,AA==" };

test("绘本页面保留顺序，每页独立保存描述、参考素材和生成结果", () => {
  const project = createVideoBookProject(guide, model);
  assert.deepEqual(project.pages.map(page => [page.pageNumber, page.imageUrl, page.description]), [[1, "/first.png", "小熊坐在树下。"], [2, "/second.png", "小熊和朋友一起看星星。"]]);
  project.pages[0]!.references.push(audio);
  project.pages[0]!.prompt = "小熊挥手";
  assert.equal(project.pages[1]!.references.length, 0);
  assert.equal(project.pages[1]!.prompt, "");
  assert.equal(project.editing, false);
  validateVideoBookSettings(project, model);
});

test("模型筛选排除纯文生视频、参考生视频和演示模型，确保首帧会送入图生视频接口", () => {
  const models = [model, { ...model, id: "text", modelName: "wan2.7-t2v" }, { ...model, id: "reference", modelName: "wan2.7-r2v" },
    { ...model, id: "mock", isMock: true }, { ...model, id: "unavailable", maxReferenceFiles: 0 }];
  assert.deepEqual(videoBookModels(models).map(item => item.id), ["wan"]);
});

test("去字选项必须使用真实处理后的首帧，不能只修改提示词或丢弃原图", () => {
  const page = createVideoBookProject(guide, model).pages[0]!;
  assert.equal(videoBookFrame(page, false), "/first.png");
  assert.throws(() => videoBookFrame(page, true), /尚未去除文字/);
  page.cleanImageUrl = "/clean.png";
  assert.equal(videoBookFrame(page, true), "/clean.png");
  assert.equal(videoBookFrame(page, false), "/first.png");
});

test("页面描述、预设动作和补充提示词共同组成请求，空自定义描述和过长内容会报错", () => {
  const page = createVideoBookProject(guide, model).pages[0]!;
  page.prompt = "树叶随风轻轻摆动";
  const prompt = videoBookPrompt(page, true);
  assert.match(prompt, /小熊坐在树下/);
  assert.match(prompt, /自然眨眼/);
  assert.match(prompt, /树叶随风/);
  assert.match(prompt, /不要添加文字/);
  assert.throws(() => videoBookPrompt({ ...page, description: "", prompt: "", motion: "custom" }, false), /请填写/);
  assert.throws(() => videoBookPrompt({ ...page, description: "熊".repeat(2000) }, false), /过长/);
});

test("参考限制预留首帧位置，拒绝重复类型、不支持的语音和超限文件", () => {
  validateVideoBookReferences([audio, image], model);
  assert.throws(() => validateVideoBookReferences([audio], { ...model, maxReferenceFiles: 1 }), /首帧已占用/);
  assert.throws(() => validateVideoBookReferences([audio], { ...model, acceptedReferenceTypes: ["image/*"] }), /不支持参考语音/);
  assert.throws(() => validateVideoBookReferences([audio, { ...audio, id: "second" }], model), /每种/);
  assert.throws(() => validateVideoBookReferences([{ ...audio, size: 11 * 1024 * 1024 }], model), /10MB/);
  assert.deepEqual(videoBookAttachment(audio), { name: audio.name, type: audio.type, mimeType: audio.mimeType, size: audio.size, dataUrl: audio.dataUrl });
});

test("刷新或批量继续生成时跳过已提交和成功的页面，避免重复扣费", () => {
  const project = createVideoBookProject(guide, model);
  const clip = { id: "task", providerTaskId: "provider-task", status: "RUNNING" as const, videoUrl: null, errorMessage: null,
    modelName: "图生视频", ratio: "16:9", duration: 5, prompt: "小熊挥手", createdAt: "2026-10-09" };
  project.pages[0]!.clip = clip;
  assert.deepEqual(pendingVideoBookPages(project).map(page => page.pageNumber), [2]);
  project.pages[0]!.clip = { ...clip, status: "SUCCEEDED", videoUrl: "/clip.mp4" };
  assert.deepEqual(pendingVideoBookPages(project).map(page => page.pageNumber), [2]);
  project.pages[0]!.clip = { ...clip, status: "FAILED" };
  assert.equal(pendingVideoBookPages(project).length, 2);
  assert.throws(() => validateVideoBookSettings({ ...project, duration: 15 }, model), /可用参数已变化/);
});

test("素材请求体超过接口上限时在提交前拒绝，避免上传失败后重复生成", async () => {
  await assert.rejects(videoBookRequest("/api/ai/video/generate", { data: "x".repeat(12 * 1024 * 1024) }), /参考素材总量过大/);
});

test("查询进度使用本站任务编号，服务商编号不同或缺失也能恢复已提交任务", async context => {
  const result = { status: "SUCCEEDED", videoUrl: "/clip.mp4", errorMessage: null };
  const requests: Array<{ path: string; method: string | undefined }> = [];
  context.mock.method(globalThis, "fetch", async (path: string, options: RequestInit) => {
    requests.push({ path, method: options.method });
    return Response.json({ code: 0, message: "成功", data: result });
  });
  for (const clip of [{ id: "local-task", providerTaskId: "provider-task" }, { id: "local-task", providerTaskId: null }]) {
    assert.deepEqual(await getVideoBookTask(clip), result);
  }
  assert.deepEqual(requests, [
    { path: "/api/ai/video/tasks/local-task", method: "GET" },
    { path: "/api/ai/video/tasks/local-task", method: "GET" }
  ]);
});
