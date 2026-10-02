import assert from "node:assert/strict";
import test from "node:test";
import { buildOutlinePrompt, createBlankPages, normalizeOutline, selectPictureBookVoice, storyTaskText, updatePictureBookPage } from "../src/picture-books/picture-book-plan.js";

test("story task keeps the complete streamed outline when stored output is a preview", () => {
  const complete = JSON.stringify({ title: "绘本", pages: Array.from({ length: 4 }, (_, index) => ({ caption: `第 ${index + 1} 页`, imagePrompt: "温暖的森林画面" })) });
  const pieces = [complete.slice(0, 60), complete.slice(60)];
  assert.equal(storyTaskText(pieces, complete.slice(0, 60), true), complete);
  assert.equal(storyTaskText([], complete.slice(0, 60), true), "");
});

test("normalizeOutline accepts a fenced plan and defaults narration to page text", () => {
  const plan = normalizeOutline("```json\n" + JSON.stringify({
    title: "月亮邮局",
    theme: "分享",
    audience: "4-6岁",
    plot: "小兔送信给月亮",
    pages: [
      { caption: "小兔发现一封信。", imagePrompt: "夜晚森林里的小兔捡起一封信" },
      { caption: "月亮收到了信。", imagePrompt: "月亮邮局中小兔递出信件", narration: "终于送到了。" }
    ]
  }) + "\n```", 2);

  assert.equal(plan.pages.length, 3);
  assert.equal(plan.pages[0]?.position, 0);
  assert.equal(plan.pages[0]?.caption, "月亮邮局");
  assert.equal(plan.pages[1]?.narration, "小兔发现一封信。");
  assert.equal(plan.pages[2]?.narration, "月亮收到了信。");
  assert.equal(plan.pages[1]?.position, 1);
});

test("normalizeOutline rejects an incomplete or mismatched storyboard", () => {
  assert.throws(() => normalizeOutline(JSON.stringify({ title: "测试", pages: [] }), 4), /页数/);
  assert.throws(() => normalizeOutline(JSON.stringify({ title: "测试", theme: "友谊", audience: "4-6岁", plot: "寻找朋友", pages: [
    { caption: "一", imagePrompt: "" }
  ] }), 1), /画面提示词/);
  assert.throws(() => normalizeOutline(JSON.stringify({ title: "测试", theme: "友谊", audience: "4-6岁", plot: "寻找朋友", pages: [null] }), 1), /第 1 页内容/);
});

test("changing page content invalidates only the related generated asset", () => {
  const original = {
    position: 1,
    caption: "旧字幕",
    imagePrompt: "旧画面",
    narration: "旧讲解",
    imageUrl: "https://example.com/image.png",
    imageTaskId: "image-task",
    audioUrl: "https://example.com/audio.wav",
    audioTaskId: "audio-task"
  };
  const changed = updatePictureBookPage(original, { imagePrompt: "新画面", narration: "新讲解" });
  assert.equal(changed.imageUrl, null);
  assert.equal(changed.imageTaskId, null);
  assert.equal(changed.audioUrl, null);
  assert.equal(changed.audioTaskId, null);
  assert.equal(changed.caption, "旧字幕");
});

test("caption edits sync default narration while preserving a manually edited script", () => {
  const original = {
    ...createBlankPages(1)[1]!,
    imageUrl: "https://example.com/image.png",
    audioUrl: "https://example.com/audio.wav",
    audioTaskId: "audio-task"
  };
  const synced = updatePictureBookPage(original, { caption: "小兔把信送到月亮邮局。" });
  assert.equal(synced.narration, synced.caption);
  assert.equal(synced.audioUrl, null);
  assert.equal(synced.audioTaskId, null);
  assert.equal(synced.imageUrl, original.imageUrl);

  const customized = updatePictureBookPage(original, { narration: "小兔终于送到了，月亮笑了。" });
  const edited = updatePictureBookPage(customized, { caption: "月亮收到了信。" });
  assert.equal(edited.narration, customized.narration);
});

test("outline prompt includes audience, style, characters and dialogue", () => {
  const prompt = buildOutlinePrompt({
    brief: "孩子学会分享",
    audience: "4-6岁",
    style: "水彩",
    pageCount: 8,
    characters: [{ name: "阿兔", description: "白色小兔，蓝色背带裤" }],
    messages: [{ role: "user", content: "希望发生在森林" }]
  });
  assert.match(prompt, /4-6岁/);
  assert.match(prompt, /水彩/);
  assert.match(prompt, /阿兔/);
  assert.match(prompt, /森林/);
  assert.match(prompt, /8 页/);
  assert.match(prompt, /imagePrompt 必须使用简体中文/);
  assert.match(prompt, /narration 必须与 caption 完全相同/);
});

test("blank storyboard creates editable pages with matching narration", () => {
  const pages = createBlankPages(4, "小熊的雨伞");
  assert.equal(pages.length, 5);
  assert.equal(pages[0]?.position, 0);
  assert.equal(pages[0]?.caption, "小熊的雨伞");
  assert.equal(pages[1]?.position, 1);
  assert.equal(pages[4]?.position, 4);
  assert.equal(pages[0]?.narration, pages[0]?.caption);
});

test("picture book narration selects the user's default or an available voice", () => {
  const voices = { defaultVoice: { voiceAssetId: null, systemVoiceId: "cosy-voice" }, systemVoices: [{ providerVoiceId: "first" }] };
  assert.deepEqual(selectPictureBookVoice({}, voices), { voice: "cosy-voice" });
  assert.deepEqual(selectPictureBookVoice({ voice: "chosen" }, voices), { voice: "chosen" });
  assert.deepEqual(selectPictureBookVoice({}, { ...voices, defaultVoice: { voiceAssetId: null, systemVoiceId: null } }), { voice: "first" });
});
