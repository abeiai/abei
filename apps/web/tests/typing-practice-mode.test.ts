import assert from "node:assert/strict";
import test from "node:test";

import { parseTypingVoice, typingAudioUrl, parseTypingPracticeMode, typingPracticeModeKey, typingPracticePresentation } from "../src/lib/typing-practice-mode.js";

test("新手上路答题时展示中文图片并播放音频，答对后保留中文", () => {
  assert.deepEqual(typingPracticePresentation("BEGINNER", false), { showTranslation: true, showImage: true, audioEnabled: true });
  assert.equal(typingPracticePresentation("BEGINNER", true).showTranslation, true);
});

test("中文听写答题和答对后均禁用音频，答题时展示中文图片", () => {
  assert.deepEqual(typingPracticePresentation("CHINESE", false), { showTranslation: true, showImage: true, audioEnabled: false });
  assert.equal(typingPracticePresentation("CHINESE", true).audioEnabled, false);
});

test("英文听写答题前隐藏中文图片，答对后全部展示", () => {
  assert.deepEqual(typingPracticePresentation("ENGLISH", false), { showTranslation: false, showImage: false, audioEnabled: true });
  assert.deepEqual(typingPracticePresentation("ENGLISH", true), { showTranslation: true, showImage: true, audioEnabled: true });
});

test("旧会话默认新手模式，各会话的练习方式独立保存", () => {
  assert.equal(parseTypingPracticeMode(null), "BEGINNER");
  assert.equal(parseTypingPracticeMode("unknown"), "BEGINNER");
  assert.equal(parseTypingPracticeMode("CHINESE"), "CHINESE");
  assert.equal(parseTypingPracticeMode("ENGLISH"), "ENGLISH");
  assert.notEqual(typingPracticeModeKey("first"), typingPracticeModeKey("second"));
});

test("四种语音严格使用对应资源，缺失时不串用其他音色", () => {
  const urls = { "uk-female": "/uk-f.mp3", "uk-male": "/uk-m.mp3", "us-female": "/us-f.mp3", "us-male": "/us-m.mp3" };
  for (const [variant, url] of Object.entries(urls)) {
    assert.equal(typingAudioUrl(urls, parseTypingVoice(variant)), url);
  }
  assert.equal(typingAudioUrl({ "uk-female": "/uk-f.mp3" }, "us-male"), null);
  assert.equal(typingAudioUrl(undefined, "uk-female"), null);
  assert.equal(parseTypingVoice(null), "uk-female");
});
