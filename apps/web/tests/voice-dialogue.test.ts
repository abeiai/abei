import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";

import {
  buildDialogueInput,
  applyDialogueQuoteMetadata,
  createDialogueDraft,
  dialogueDraftKey,
  dialogueInputKey,
  dialogueOperationPath,
  dialogueOutputIsCurrent,
  dialoguePlayback,
  dialogueSegmentAudio,
  dialogueSpeedBounds,
  isDialogueBusy,
  parseVoiceDialogue,
  quoteIsCurrent,
  requestVoiceDialogue,
  readyDialogueVoices,
  restoreDialogueDraft,
  validateDialogueInput,
  type DialogueProject
} from "../src/lib/voice-dialogue";

const voices = [
  { value: "cosyvoice-v35:announcer", name: "模板", badge: "模板" },
  { value: "system:ready", name: "系统", badge: "系统", supportedModels: ["eleven_v3"] },
  { value: "voice:custom", name: "自定义", badge: "自定义", supportedModels: ["cosyvoice-v3.5-plus"] }
];
const models = [
  { aliasKey: "tts-default", modelName: "eleven_v3", isConfigured: true },
  { aliasKey: "tts-other", modelName: "cosyvoice-v3.5-plus", isConfigured: true }
];

function input() {
  const draft = createDialogueDraft();
  Object.assign(draft, parseVoiceDialogue("Student A: Hello.\nStudent B：Hi."));
  draft.speakers.forEach((speaker) => {
    speaker.voiceValue = "system:ready";
  });
  return buildDialogueInput(draft);
}

function project(): DialogueProject {
  const value = input();
  return {
    ...value,
    id: "project-1",
    title: "对话",
    revision: 2,
    status: "SUCCEEDED",
    createdAt: "2026-09-14T00:00:00Z",
    updatedAt: "2026-09-14T00:00:00Z",
    actualCredits: 3,
    audioUrl: "https://audio.example/complete.mp3",
    outputRevision: 2,
    errorMessage: null,
    generationId: "generation-1",
    segments: value.segments.map((segment) => ({
      ...segment,
      status: "SUCCEEDED",
      audioUrl: `https://audio.example/${segment.id}.mp3`,
      errorMessage: null
    }))
  };
}

test("重复中英文角色复用稳定 ID，移除前缀并保留续行顺序", () => {
  const parsed = parseVoiceDialogue("Student A: Hello.\nStudent B：Hi.\nStudent A: Again.\ncontinued");
  assert.deepEqual(
    parsed.segments.map((segment) => segment.text),
    ["Hello.", "Hi.", "Again.\ncontinued"]
  );
  assert.equal(parsed.speakers.length, 2);
  assert.equal(parsed.segments[0].speakerId, parsed.segments[2].speakerId);
  assert.equal(parsed.segments[0].pauseSeconds, 1);
  const repeated = parseVoiceDialogue("Student B: New.\nStudent A: More.", parsed);
  assert.equal(repeated.speakers[0].id, parsed.speakers[1].id);
});

test("识别任意重复英文姓名角色，不依赖内置姓名白名单", () => {
  const source = [
    "Tom: Hi Nancy! What are you doing here so early?",
    "Nancy: Morning Tom. I just finished my morning jogging. I keep running three times a week to stay fit.",
    "Tom: That’s amazing! I barely do any exercise these days. I always stay up playing games and feel tired all day.",
    "Nancy: No wonder you look sluggish. Regular exercise can boost your energy and improve your sleep. What sports do you like at all?",
    "Tom: I used to love playing basketball with classmates, but I haven’t touched the ball for months. It’s hard to spare time.",
    "Nancy: You don’t need long hours. Even a 30-minute workout every day works. How about joining me for jogging this weekend? We can also play badminton afterward.",
    "Tom: Sounds great! Badminton is light and won’t make me exhausted. Do you have any other sports hobbies?",
    "Nancy: I also take yoga classes every Sunday. It helps me relax my body and ease study pressure.",
    "Tom: I’ve never tried yoga before. Is it difficult for beginners?",
    "Nancy: Not really. The coach will teach basic moves step by step. You can come with me if you’re interested.",
    "Tom: I’d love to! From tomorrow I’ll cut down game time and stick to sports with you.",
    "Nancy: Perfect! Let’s encourage each other and keep exercising together."
  ].join("\n");
  const parsed = parseVoiceDialogue(source);

  assert.deepEqual(parsed.speakers.map((speaker) => speaker.name), ["Tom", "Nancy"]);
  assert.equal(parsed.segments.length, 12);
  assert.equal(parsed.segments[0].text, "Hi Nancy! What are you doing here so early?");
  assert.equal(parsed.segments[1].text, "Morning Tom. I just finished my morning jogging. I keep running three times a week to stay fit.");
  assert.equal(parsed.segments.every((segment) => !/^(?:Tom|Nancy)[:：]/.test(segment.text)), true);
});

test("新对话与缺省草稿的语速和段尾停顿默认 1，保留旧段落显式设置", () => {
  const parsed = parseVoiceDialogue("Student A: Hello.\nStudent B: Hi.");
  assert.deepEqual(parsed.segments.map(({ speed, pauseSeconds }) => ({ speed, pauseSeconds })), [
    { speed: 1, pauseSeconds: 1 },
    { speed: 1, pauseSeconds: 1 }
  ]);
  parsed.segments[0].speed = 1.1;
  parsed.segments[0].pauseSeconds = 2;
  const repeated = parseVoiceDialogue("Student A: Hello.\nStudent B: Hi.", parsed);
  assert.equal(repeated.segments[0].speed, 1.1);
  assert.equal(repeated.segments[0].pauseSeconds, 2);
  const restored = restoreDialogueDraft(JSON.stringify({
    ...input(),
    segments: input().segments.map((segment, index) => ({ ...segment, speed: undefined, pauseSeconds: index === 0 ? undefined : 0.5 }))
  }), voices);
  assert.equal(restored.segments[0].speed, 1);
  assert.equal(restored.segments[0].pauseSeconds, 1);
  assert.equal(restored.segments[1].pauseSeconds, 0.5);
});

test("括号角色、无归属前文、空行与中文角色不丢失正文", () => {
  const parsed = parseVoiceDialogue("前文\n\n（学生甲）：你好\n下一行\n[学生乙] Hi\n学生甲：再见");
  assert.deepEqual(
    parsed.segments.map((segment) => segment.text),
    ["前文", "你好\n下一行", "Hi", "再见"]
  );
  assert.equal(parsed.segments[0].speakerId, "");
  assert.equal(parsed.speakers.length, 2);
});

test("URL、时间与正文内部冒号保持原样，不猜测为角色", () => {
  const text = "https://example.com:3320/path\n12:30 meeting\n内容中有：冒号\nNote: not a role";
  const parsed = parseVoiceDialogue(text);
  assert.equal(parsed.segments[0].text, text);
  assert.equal(parsed.speakers.length, 0);
});

test("单人与多人草稿独立，恢复只接受有界且干净的编辑输入", () => {
  assert.notEqual(dialogueDraftKey("user-1"), "xueleai:experience-voice:draft");
  assert.notEqual(dialogueDraftKey("user-1"), dialogueDraftKey("learner-1"));
  const single = { text: "单人原稿" };
  const draft = createDialogueDraft();
  draft.sourceText = "多人原稿";
  const restored = restoreDialogueDraft(
    JSON.stringify({ ...draft, ...input(), audioUrl: "https://fake", status: "SUCCEEDED" }),
    voices
  );
  restored.segments[0].text = "只修改多人";
  assert.equal(single.text, "单人原稿");
  assert.equal(restored.sourceText, "多人原稿");
  assert.equal("audioUrl" in restored, false);
  assert.equal("status" in restored, false);
  assert.deepEqual(restoreDialogueDraft("invalid", voices), createDialogueDraft());
  const oversized = {
    ...draft,
    segments: Array.from({ length: 101 }, (_, index) => ({ ...input().segments[0], id: `segment-${index}` }))
  };
  assert.equal(restoreDialogueDraft(JSON.stringify(oversized), voices).segments.length, 0);
});

test("多人项目草稿只在对应项目中恢复，新建和单人历史保持空白", () => {
  const linked = {
    ...createDialogueDraft(),
    ...input(),
    projectId: "project-1",
    revision: 2,
    sourceText: "Student A: Hello."
  };
  const raw = JSON.stringify(linked);

  assert.equal(restoreDialogueDraft(raw, voices, { allowUnbound: true }).segments.length, 0);
  assert.equal(restoreDialogueDraft(raw, voices, { allowUnbound: false }).segments.length, 0);
  assert.deepEqual(restoreDialogueDraft(raw, voices, { projectId: "project-1" }), linked);
  assert.equal(restoreDialogueDraft(raw, voices, { projectId: "project-2" }).segments.length, 0);
});

test("超限正文保留为编辑草稿，刷新不会清空原稿和角色", () => {
  const value = {
    ...createDialogueDraft(),
    sourceText: "Student A: original",
    speakers: [{ id: "a", name: "Student A", voiceValue: "system:alice" }],
    segments: [{ id: "s1", speakerId: "a", text: "x".repeat(8001), speed: 1, pauseSeconds: 0.5 }]
  };
  const restored = restoreDialogueDraft(JSON.stringify(value), [{ value: "system:alice" }]);
  assert.equal(restored.segments[0]?.text.length, value.segments[0].text.length);
  assert.equal(restored.sourceText, value.sourceText);
  assert.deepEqual(restored.speakers, value.speakers);
});

test("多人不使用设计模板，恢复的模板映射清空而不自动创建设计音色", () => {
  assert.deepEqual(
    readyDialogueVoices(voices).map((voice) => voice.value),
    ["system:ready", "voice:custom"]
  );
  const value = input();
  value.speakers[0].voiceValue = "cosyvoice-v35:announcer";
  assert.match(validateDialogueInput(value, voices, models) ?? "", /已就绪|可用音色/);
  const restored = restoreDialogueDraft(JSON.stringify(value), voices);
  assert.equal(restored.speakers[0].voiceValue, "");
});

test("单句请求保留整篇快照但 segmentId 只指向选中句，不自行携带总价或其他强制句", () => {
  const value = input();
  const request = buildDialogueInput(
    { ...createDialogueDraft(), ...value },
    { projectId: "project-1", revision: 2, segmentId: value.segments[1].id }
  );
  assert.equal(request.segmentId, value.segments[1].id);
  assert.equal(request.segments.length, 2);
  assert.equal("totalCredits" in request, false);
  assert.equal("segmentIds" in request, false);
  assert.equal(request.projectId, "project-1");
  request.segments[0].text = "修改副本";
  assert.equal(value.segments[0].text, "Hello.");
  assert.throws(() => buildDialogueInput({ ...createDialogueDraft(), ...value }, { segmentId: "missing" }), /段落/);
});

test("模型速度、正文上限、停顿精度、未归属段落在报价前校验，不静默截断", () => {
  assert.deepEqual(dialogueSpeedBounds("eleven_v3"), { min: 0.7, max: 1.2 });
  assert.deepEqual(dialogueSpeedBounds("cosyvoice-v3.5-plus"), { min: 0.5, max: 2 });
  const value = input();
  assert.equal(validateDialogueInput(value, voices, models), null);
  value.segments[0].speed = 1.3;
  assert.match(validateDialogueInput(value, voices, models) ?? "", /语速/);
  value.segments[0].speed = 1;
  value.segments[0].pauseSeconds = 0.55;
  assert.match(validateDialogueInput(value, voices, models) ?? "", /停顿/);
  value.segments[0].pauseSeconds = 5;
  value.segments[0].text = "a".repeat(5001);
  assert.match(validateDialogueInput(value, voices, models) ?? "", /5000/);
  value.segments[0].text = "正常";
  value.segments[0].speakerId = "";
  assert.match(validateDialogueInput(value, voices, models) ?? "", /角色/);
});

test("当前账户扣费身份覆盖旧草稿空间，不改写合成内容或原草稿", () => {
  const draft = { ...createDialogueDraft(), ...input(), billingContext: "ORGANIZATION" as const, organizationId: "old-org" };
  const personal = buildDialogueInput(draft, {}, "");
  const organization = buildDialogueInput(draft, {}, "active-org");
  assert.equal(personal.billingContext, "PERSONAL");
  assert.equal("organizationId" in personal, false);
  assert.equal(organization.billingContext, "ORGANIZATION");
  assert.equal(organization.organizationId, "active-org");
  assert.equal(buildDialogueInput(draft).organizationId, "old-org");
  assert.equal(draft.organizationId, "old-org");
  assert.deepEqual(personal.segments, draft.segments);
  assert.deepEqual(organization.speakers, draft.speakers);
  assert.equal(personal.sampleRate, 24000);
  assert.equal(personal.format, "wav");
  assert.notEqual(dialogueInputKey(personal), dialogueInputKey(organization));
});

test("编辑使报价失效，10 分钟到期不可确认，单句范围也是报价身份", () => {
  const value = input();
  const now = Date.parse("2026-09-14T00:00:00Z");
  const quote = {
    id: "quote-1",
    projectId: "project-1",
    revision: 2,
    expiresAt: new Date(now + 600000).toISOString(),
    totalCredits: 3,
    segments: []
  };
  const key = dialogueInputKey(value);
  assert.equal(quoteIsCurrent(quote, key, value, now), true);
  assert.equal(quoteIsCurrent(quote, key, value, now + 600000), false);
  value.segments[0].pauseSeconds = 2;
  assert.equal(quoteIsCurrent(quote, key, value, now), false);
  value.segments[0].pauseSeconds = 1;
  value.segmentId = value.segments[0].id;
  assert.equal(quoteIsCurrent(quote, key, value, now), false);
});

test("报价期间发生的本地编辑保留，只更新返回的项目 ID 和版本用于下一次请求", () => {
  const draft = { ...createDialogueDraft(), ...input() };
  const oldKey = dialogueInputKey(buildDialogueInput(draft));
  draft.sourceText = "保留原稿";
  draft.segments[0].text = "获取报价期间修改了正文";
  const quote = {
    id: "quote-1",
    projectId: "project-1",
    revision: 4,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    totalCredits: 3,
    segments: []
  };
  const updated = applyDialogueQuoteMetadata(draft, quote);
  assert.equal(updated.segments[0].text, "获取报价期间修改了正文");
  assert.equal(updated.sourceText, "保留原稿");
  assert.equal(buildDialogueInput(updated).revision, 4);
  assert.equal(buildDialogueInput(updated).projectId, "project-1");
  assert.equal(quoteIsCurrent(quote, oldKey, buildDialogueInput(updated)), false);
});

test("正文、音色与语速修改隐藏旧分句；停顿保留分句但使成品失效", () => {
  const saved = project();
  const draft = { ...createDialogueDraft(), ...buildDialogueInput(saved) };
  assert.equal(dialogueOutputIsCurrent(saved, draft), true);
  assert.ok(dialogueSegmentAudio(saved, draft, draft.segments[0].id));
  draft.segments[0].pauseSeconds = 2;
  assert.ok(dialogueSegmentAudio(saved, draft, draft.segments[0].id));
  assert.equal(dialogueOutputIsCurrent(saved, draft), false);
  draft.segments[0].text = "修改后的句子";
  assert.equal(dialogueSegmentAudio(saved, draft, draft.segments[0].id), null);
  draft.segments[0].text = saved.segments[0].text;
  draft.speakers[0].voiceValue = "voice:custom";
  assert.equal(dialogueSegmentAudio(saved, draft, draft.segments[0].id), null);
});

test("服务器部分完成或旧版本输出不冒充当前完整音频", () => {
  const saved = project();
  saved.segments[1].status = "PENDING";
  saved.segments[1].audioUrl = null;
  const draft = { ...createDialogueDraft(), ...buildDialogueInput(saved) };
  assert.equal(dialogueOutputIsCurrent(saved, draft), false);
  saved.segments[1].status = "SUCCEEDED";
  saved.segments[1].audioUrl = "https://audio.example/ready.mp3";
  saved.outputRevision = 1;
  assert.equal(dialogueOutputIsCurrent(saved, draft), false);
  assert.equal(isDialogueBusy("PARTIAL_FAILED"), false);
  assert.equal(isDialogueBusy("MERGING"), true);
});

test("重新识别删除后的草稿不会生成重复段落 ID", () => {
  const parsed = parseVoiceDialogue("Student A: One.\nStudent B: Two.\nStudent A: Three.");
  parsed.segments.splice(1, 1);
  const repeated = parseVoiceDialogue("Student A: One.\nStudent A: Three.\nStudent B: Four.", parsed);
  assert.equal(new Set(repeated.segments.map((segment) => segment.id)).size, 3);
});

test("括号内时间和 URL 不是角色", () => {
  const source = "[12:30] meeting\n[https://example.com] source\n(00:05) timestamp";
  const parsed = parseVoiceDialogue(source);
  assert.equal(parsed.speakers.length, 0);
  assert.equal(parsed.segments[0].text, source);
});

test("未使用角色也须绑定就绪音色，角色名称、ID 与全局上限遵循输入契约", () => {
  const value = input();
  value.speakers.push({ id: "unused", name: "未使用角色", voiceValue: "" });
  assert.match(validateDialogueInput(value, voices, models) ?? "", /就绪|音色/);
  value.speakers.pop();
  value.speakers[0].name = "";
  assert.match(validateDialogueInput(value, voices, models) ?? "", /名称/);
  value.speakers[0].name = "长".repeat(80);
  assert.equal(validateDialogueInput(value, voices, models), null);
  assert.equal(restoreDialogueDraft(JSON.stringify(value), voices).speakers[0].name.length, 80);
  value.segments[1].id = value.segments[0].id;
  assert.match(validateDialogueInput(value, voices, models) ?? "", /标识/);
});

test("项目待生成、跨项目同名句子与修改后的采样率不显示完成音频", () => {
  const saved = project();
  const draft = {
    ...createDialogueDraft(),
    ...buildDialogueInput(saved, { projectId: saved.id, revision: saved.revision })
  };
  saved.status = "QUEUED";
  assert.equal(dialogueOutputIsCurrent(saved, draft), false);
  saved.status = "SUCCEEDED";
  draft.projectId = "other-project";
  assert.equal(dialogueSegmentAudio(saved, draft, draft.segments[0].id), null);
  draft.projectId = saved.id;
  draft.sampleRate = 48000;
  assert.equal(dialogueOutputIsCurrent(saved, draft), false);
});

test("未提交编辑、生成中和部分失败时旧成品仍可播放，但不标为当前结果", () => {
  const saved = project();
  const draft = { ...createDialogueDraft(), ...buildDialogueInput(saved) };
  assert.equal(dialoguePlayback(saved, draft)?.current, true);
  draft.segments[0].text = "编辑后的新正文";
  assert.deepEqual(dialoguePlayback(saved, draft), { url: saved.audioUrl, revision: 2, current: false });
  saved.status = "PROCESSING";
  assert.equal(dialoguePlayback(saved, draft)?.url, saved.audioUrl);
  assert.equal(dialoguePlayback(saved, draft)?.current, false);
  saved.status = "PARTIAL_FAILED";
  saved.revision = 3;
  assert.equal(dialoguePlayback(saved, draft)?.revision, 2);
  saved.audioUrl = null;
  assert.equal(dialoguePlayback(saved, draft), null);
});

test("BFF 路径只允许五项契约操作，拒绝跨方法与任意路径", () => {
  assert.equal(dialogueOperationPath("projects", "GET"), "/audio/dialogue/projects");
  assert.equal(dialogueOperationPath("project", "GET", "project-1"), "/audio/dialogue/projects/project-1");
  assert.equal(dialogueOperationPath("quote", "POST"), "/audio/dialogue/quotes");
  assert.equal(dialogueOperationPath("generate", "POST"), "/audio/dialogue/generations");
  assert.equal(dialogueOperationPath("merge", "POST", "project-1"), "/audio/dialogue/projects/project-1/merge");
  assert.equal(dialogueOperationPath("quote", "GET"), null);
  assert.equal(dialogueOperationPath("merge", "POST", "../tasks"), null);
  assert.equal(dialogueOperationPath("https://example.com", "GET"), null);
});

test("客户端只提交服务端确认标识，网络/非 JSON/内部错误转换为中文", async () => {
  const original = globalThis.fetch;
  try {
    let sentBody: unknown;
    globalThis.fetch = async (_url, init) => {
      sentBody = JSON.parse(String(init?.body));
      return Response.json({ code: 0, message: "成功", data: project() });
    };
    await requestVoiceDialogue("generate", { body: { quoteId: "quote-1" } });
    assert.deepEqual(sentBody, { quoteId: "quote-1" });
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(requestVoiceDialogue("projects"), /暂时无法连接/);
    globalThis.fetch = async () => new Response("Internal server error", { status: 502 });
    await assert.rejects(requestVoiceDialogue("projects"), /语音服务暂时不可用/);
    globalThis.fetch = async () =>
      Response.json({ code: 50001, message: "Prisma 数据异常 stack trace", data: null }, { status: 500 });
    await assert.rejects(requestVoiceDialogue("projects"), /语音服务暂时不可用/);
  } finally {
    globalThis.fetch = original;
  }
});

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers")
      return {
        shortCircuit: true,
        url: "data:text/javascript,export async function headers(){return new Headers({'cookie':'xueleai_profile_context=selected; user_access_token=token','authorization':'Bearer token','x-untrusted':'no'})}"
      };
    return nextResolve(specifier, context);
  }
});

test("BFF 转发 cookie 身份与认证，不转发任意请求头/计费字段", async () => {
  const route = await import("../src/app/voice/api/route");
  const original = globalThis.fetch;
  try {
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({ code: 0, message: "成功", data: project() });
    };
    const response = await route.POST(
      new Request("http://localhost:3321/voice/api?operation=generate", {
        method: "POST",
        body: JSON.stringify({ quoteId: "quote-1", totalCredits: 0, learnerId: "other" })
      })
    );
    assert.equal(response.status, 200);
    assert.equal(new URL(requests[0].url).pathname, "/api/audio/dialogue/generations");
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { quoteId: "quote-1" });
    const forwarded = new Headers(requests[0].init?.headers);
    assert.match(forwarded.get("cookie") ?? "", /xueleai_profile_context=selected/);
    assert.equal(forwarded.get("authorization"), "Bearer token");
    assert.equal(forwarded.has("x-untrusted"), false);
    const invalidSentence = await route.POST(
      new Request("http://localhost:3321/voice/api?operation=quote", {
        method: "POST",
        body: JSON.stringify({ ...input(), segmentId: 12 })
      })
    );
    assert.equal(invalidSentence.status, 400);
    assert.equal(requests.length, 1);
    const rejected = await route.GET(
      new Request("http://localhost:3321/voice/api?operation=project&projectId=..%2Ftasks")
    );
    assert.equal(rejected.status, 400);
    assert.equal(requests.length, 1);
    globalThis.fetch = async () => new Response("Internal server error", { status: 502 });
    const error = await route.GET(new Request("http://localhost:3321/voice/api?operation=projects"));
    assert.equal(error.status, 502);
    assert.match((await error.json()).message, /语音服务/);
  } finally {
    globalThis.fetch = original;
  }
});
