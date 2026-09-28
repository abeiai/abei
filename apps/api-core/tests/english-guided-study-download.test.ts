import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { EnglishGuidedStudyDownloadController } from "../src/english-guided-study/english-guided-study-download.controller.js";

const implementation = () => import("../src/english-guided-study/english-guided-study-download.service.js").catch(() => null);

test("课件下载按讲解节点顺序包含导语、正文和结束语，版本随音频变化", async () => {
  const module = await implementation();
  assert.ok(module, "课件音频下载服务已实现");
  const material = {
    audioUrl: "https://cdn.example/intro.mp3",
    content: { narrationTimelineV2: { nodes: [
      { audioUrl: "https://cdn.example/intro.mp3" },
      { audioUrl: "https://cdn.example/body.mp3" },
      { audioUrl: "https://cdn.example/end.mp3" }
    ] } }
  };
  const plan = module.courseAudioDownloadPlan(material, "narration");
  assert.deepEqual(plan.urls, material.content.narrationTimelineV2.nodes.map(node => node.audioUrl));
  assert.equal(plan.original, false);
  assert.equal(plan.revision, module.courseAudioDownloadPlan(material, "narration").revision);
  material.content.narrationTimelineV2.nodes[1]!.audioUrl += "?v=2";
  assert.notEqual(plan.revision, module.courseAudioDownloadPlan(material, "narration").revision);
});

test("上传示范语音下载原件，合成示范语音包含标题作者和所有正文节点", async () => {
  const module = await implementation(); assert.ok(module);
  const readAlong = { source: "UPLOAD", audioUrl: "https://cdn.example/original.m4a", audioName: "原声.m4a", nodes: [] as { audioUrl: string }[] };
  const material = { audioUrl: null, content: { readAlong } };
  assert.deepEqual(module.courseAudioDownloadPlan(material, "demonstration").urls, [readAlong.audioUrl]);
  assert.equal(module.courseAudioDownloadPlan(material, "demonstration").original, true);
  readAlong.source = "GENERATED";
  readAlong.nodes = ["title", "author", "body"].map(part => ({ audioUrl: `https://cdn.example/${part}.mp3` }));
  assert.deepEqual(module.courseAudioDownloadPlan(material, "demonstration").urls, readAlong.nodes.map(node => node.audioUrl));
  assert.equal(module.courseAudioDownloadPlan(material, "demonstration").original, false);
  readAlong.nodes[1]!.audioUrl = "";
  assert.throws(() => module.courseAudioDownloadPlan(material, "demonstration"), /不完整/);
  assert.throws(() => module.courseAudioDownloadPlan(material, "other"), /参数/);
});

test("下载仅读取当前账号和档案的课件音频，禁止任意地址及缺失音频", async () => {
  const module = await implementation(); assert.ok(module);
  const service = new module.EnglishGuidedStudyDownloadService();
  let processed = 0;
  let materialScope: unknown;
  let assets: unknown[] = [{ userId: "owner", url: "https://cdn.example/one.mp3", storageProvider: "S3", objectKey: "one.mp3", mimeType: "audio/mpeg" }];
  let material: unknown = { id: "lesson", title: "Lesson", audioUrl: "https://cdn.example/one.mp3", content: {} };
  Object.assign(service, {
    prisma: {
      englishGuidedStudyMaterial: { findFirst: async ({ where }: { where: unknown }) => { materialScope = where; return material; } },
      audioAsset: { findMany: async () => assets }
    },
    render: async () => { processed++; return { bytes: Buffer.from("audio"), mimeType: "audio/mpeg" }; }
  });
  const subject = { userId: "owner", learnerId: "child", mode: "LEARNER" as const };
  const output = await service.download(subject, "lesson", "narration");
  assert.equal(output.bytes.toString(), "audio");
  assert.deepEqual(materialScope, { id: "lesson", userId: "owner", learnerId: "child" });
  assets = [{ userId: "someone-else", url: "https://cdn.example/one.mp3" }];
  await assert.rejects(service.download(subject, "lesson", "narration"), /不完整|不存在/);
  material = null;
  await assert.rejects(service.download(subject, "lesson", "narration"), /不存在/);
  assert.equal(processed, 1);
});

test("重复点击共用一次合并，失败后可重试，重新生成使用新的版本", async () => {
  const module = await implementation(); assert.ok(module);
  const service = new module.EnglishGuidedStudyDownloadService();
  let processed = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const material = { id: "lesson", title: "Lesson", audioUrl: "https://cdn.example/one.mp3", content: {} };
  Object.assign(service, {
    prisma: {
      englishGuidedStudyMaterial: { findFirst: async () => material },
      audioAsset: { findMany: async () => [{ userId: "owner", url: material.audioUrl, mimeType: "audio/mpeg" }] }
    },
    render: async () => { processed++; await gate; return { bytes: Buffer.from("audio"), mimeType: "audio/mpeg" }; }
  });
  const subject = { userId: "owner", learnerId: null, mode: "ACCOUNT" as const };
  const first = service.download(subject, "lesson", "narration");
  const second = service.download(subject, "lesson", "narration");
  const learner = service.download({ ...subject, mode: "LEARNER", learnerId: "child" }, "lesson", "narration");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(processed, 1);
  release();
  assert.deepEqual((await first).bytes, (await second).bytes);
  assert.deepEqual((await first).bytes, (await learner).bytes);
  material.audioUrl = "https://cdn.example/new.mp3";
  await service.download(subject, "lesson", "narration");
  assert.equal(processed, 2);
  Object.assign(service, { render: async () => { throw new Error("fixture"); } });
  await assert.rejects(service.download(subject, "lesson", "narration"), /下载失败/);
  Object.assign(service, { render: async () => ({ bytes: Buffer.from("retry"), mimeType: "audio/mpeg" }) });
  assert.equal((await service.download(subject, "lesson", "narration")).bytes.toString(), "retry");
});

test("下载控制器先核对登录、档案与场景授权，断开或拒绝授权不读取音频", async () => {
  const subject = { userId: "owner", learnerId: "child", mode: "LEARNER" as const };
  let exported = 0;
  const makeResponse = () => Object.assign(new EventEmitter(), { writableEnded: false, set: () => undefined, send: () => undefined });
  const request = Object.assign(new EventEmitter(), { headers: {}, aborted: false });
  const controller = new EnglishGuidedStudyDownloadController(
    { download: async () => { exported++; return { bytes: Buffer.from("audio"), mimeType: "audio/mpeg", filename: "标题.mp3" }; } } as never,
    { getMaterialAuthorizationRoot: async (value: unknown, id: string) => { assert.deepEqual(value, subject); assert.equal(id, "lesson"); return "english-guided-study-material"; } } as never,
    { me: async () => ({ id: "owner" }) } as never,
    { requireSelected: async () => subject } as never,
    { assertScenarioAuthorized: async () => { throw new Error("无访问权限"); }, runWithScenarioAuthorization: async (_subject: unknown, _root: string, run: () => Promise<unknown>) => run() } as never
  );
  await assert.rejects(controller.download(request, makeResponse(), "lesson", "narration"), /无访问权限/);
  assert.equal(exported, 0);
  Object.assign(controller, { access: { assertScenarioAuthorized: async () => undefined, runWithScenarioAuthorization: async (_subject: unknown, root: string, run: () => Promise<unknown>) => { assert.equal(root, "english-guided-study-material"); return run(); } } });
  const response = makeResponse();
  let headers: Record<string, string> = {};
  response.set = value => { headers = value; };
  await controller.download(request, response, "lesson", "narration");
  assert.equal(exported, 1);
  assert.match(headers["Content-Disposition"]!, /filename\*=UTF-8''%/);
  assert.equal(request.listenerCount("aborted"), 0);
  request.aborted = true;
  await assert.rejects(controller.download(request, makeResponse(), "lesson", "narration"));
  assert.equal(exported, 1);
});
