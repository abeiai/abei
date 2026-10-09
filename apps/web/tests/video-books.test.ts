import assert from "node:assert/strict";
import test from "node:test";
import { createVideoBookProject, getVideoBookTask, normalizeVideoBookModel, pendingVideoBookPages, validateVideoBookReferences, validateVideoBookSettings, videoBookAttachment, videoBookErrorMessage, videoBookFrame, videoBookModels, videoBookPollingError, videoBookPrompt, videoBookRequest, VideoBookRequestError, waitForVideoBookPoll } from "../src/lib/video-books.js";
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

test("失败任务说明首帧格式错误并提供重试指引，其他错误保持原提示", () => {
  assert.match(videoBookErrorMessage("Field required: input.media.0.url"), /首帧参数格式错误.*重试本页视频/);
  assert.equal(videoBookErrorMessage("余额不足"), "余额不足");
  assert.equal(videoBookErrorMessage(null), "");
});

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

test("停止等待会立即中断下一次查询的延时，已停止的信号也不会开始等待", async () => {
  const controller = new AbortController();
  const waiting = waitForVideoBookPoll(controller.signal, 10);
  controller.abort();
  await assert.rejects(waiting, { name: "AbortError" });
  await assert.rejects(waitForVideoBookPoll(controller.signal, 0), { name: "AbortError" });
});

test("任务不存在保留业务错误码，以便停止无效轮询而不重复提交任务", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ code: 40401, message: "视频任务不存在", data: null }, { status: 404 }));
  await assert.rejects(getVideoBookTask({ id: "missing" }), cause => cause instanceof VideoBookRequestError && cause.code === 40401);
});

test("多页同时查询时，前一页的网络错误不会掩盖后一页的任务不存在", async () => {
  const missing = new VideoBookRequestError("视频任务不存在", 40401);
  const results = await Promise.allSettled([Promise.reject(new Error("网络暂时不可用")), Promise.reject(missing), Promise.resolve({ status: "RUNNING" })]);
  assert.equal(videoBookPollingError(results), missing);
  assert.equal(videoBookPollingError([]), undefined);
});

test("读取进度响应时点击停止，保留中止信号而不误报请求失败", async context => {
  const controller = new AbortController();
  const response = Response.json({ code: 0, data: { status: "RUNNING" } });
  context.mock.method(response, "json", async () => { controller.abort(); throw new DOMException("已停止", "AbortError"); });
  context.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(getVideoBookTask({ id: "local-task" }, controller.signal), { name: "AbortError" });
});

test("绘本视频只提供 MiniMax H3s 和 Wan3.0-Video-Prime，排除其他模型、演示和重复实例", () => {
  const prime = { ...model, id: "prime", modelName: "wan3.0-video-prime", defaultResolution: "高清 1080P", supportedResolutions: ["高清 480P", "高清 720P", "高清 1080P"] };
  const minimax = { ...model, id: "minimax", modelName: "MiniMax-H3", defaultResolution: "高清 768P", supportedResolutions: ["高清 480P", "高清 768P"] };
  const models = [model, { ...model, id: "horse", modelName: "happyhorse-1.0-i2v" }, prime, minimax,
    { ...prime, id: "duplicate" }, { ...minimax, id: "mock", isMock: true }];
  const choices = videoBookModels(models);
  assert.deepEqual(choices.map(item => [item.id, item.displayName]), [["minimax", "MiniMax H3s"], ["prime", "Wan3.0-Video-Prime"]]);
  for (const choice of choices) {
    assert.equal(createVideoBookProject(guide, choice).resolution, "高清 480P");
    validateVideoBookSettings(createVideoBookProject(guide, choice), choice);
  }
  assert.deepEqual(videoBookModels([{ ...prime, maxReferenceFiles: 0 }, { ...minimax, acceptedReferenceTypes: [] }]), []);
});

test("旧作品的已移除模型切换到默认模型并同步可用参数，保留页面与历史视频", () => {
  const project = createVideoBookProject(guide, model);
  const minimax = { ...model, id: "minimax", modelName: "MiniMax-H3", defaultResolution: "高清 768P", supportedResolutions: ["高清 480P", "高清 768P"] };
  const normalized = normalizeVideoBookModel(project, [minimax]);
  assert.equal(normalized.modelId, "minimax");
  assert.equal(normalized.resolution, "高清 768P");
  assert.equal(normalized.duration, project.duration);
  assert.equal(normalized.pages, project.pages);
  assert.equal(project.modelId, "wan");
  validateVideoBookSettings(normalized, minimax);
  assert.equal(normalizeVideoBookModel(normalized, [minimax]), normalized);
  assert.equal(normalizeVideoBookModel(project, []), project);
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
