import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

import type { VoiceModelOption } from "../src/components/experience/voice-console";
import { VoiceDownloadButton } from "../src/components/audio/voice-download-button";
import { createDialogueDraft, parseVoiceDialogue, type DialogueProject } from "../src/lib/voice-dialogue";

// Node's SSR harness needs to unwrap Next.js's CommonJS image entry point.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/image") {
      const resolved = nextResolve(specifier, context);
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(`import image from ${JSON.stringify(resolved.url)}; export default image.default ?? image;`)}` };
    }
    return nextResolve(specifier, context);
  }
});
const { VoiceConsole } = await import("../src/components/experience/voice-console");

function elements(node: DefaultTreeAdapterMap["node"]): DefaultTreeAdapterMap["element"][] {
  return [
    ...("tagName" in node ? [node] : []),
    ...("childNodes" in node ? node.childNodes.flatMap(elements) : [])
  ];
}

function text(node: DefaultTreeAdapterMap["node"]): string {
  return "value" in node ? node.value : "childNodes" in node ? node.childNodes.map(text).join("") : "";
}

function render(element: React.ReactElement) {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previous = runtime.React;
  runtime.React = React;
  try { return elements(parseFragment(renderToStaticMarkup(element))); }
  finally { runtime.React = previous; }
}

const voice = { value: "system:ready", name: "测试音色", badge: "系统", supportedModels: ["eleven_v3"] };
const model: VoiceModelOption = {
  aliasKey: "tts-default", displayName: "测试模型", statusName: "可用", providerName: "ElevenLabs",
  modelName: "eleven_v3", isConfigured: true, inputPrice: "0", outputPrice: "0",
  pricingMode: "CHARACTERS", pricingUnit: "K_CHARACTERS", creditsPerCny: 1
};
const parsed = parseVoiceDialogue("Student A: Hello.");
parsed.speakers[0].voiceValue = voice.value;
const project: DialogueProject = {
  ...createDialogueDraft(), ...parsed, billingContext: "ORGANIZATION", organizationId: "old-org",
  id: "project-1", title: "测试对话", revision: 1, status: "DRAFT", actualCredits: 0,
  createdAt: "2026-09-14T00:00:00Z", updatedAt: "2026-09-14T00:00:00Z",
  audioUrl: null, outputRevision: null, generationId: null, errorMessage: null,
  segments: parsed.segments.map(segment => ({ ...segment, status: "PENDING", audioUrl: null, errorMessage: null }))
};
const attrs = (element: DefaultTreeAdapterMap["element"]) => Object.fromEntries(element.attrs.map(({ name, value }) => [name, value]));

test("单人和多人语速滑块为 0.5–2.0，每格 0.1，默认 1；段尾停顿为 0–3，每格 0.5，默认 1", () => {
  const nodes = render(React.createElement(VoiceConsole, {
    currentUser: null, models: [model], voices: [voice], history: [], currentTask: null,
    currentProject: project, organizations: null, createAction: () => undefined, initialOrganizationId: "active-org"
  }));
  const inputs = nodes.filter(node => node.tagName === "input").map(attrs);
  const speed = inputs.filter(input => input.type === "range" && (input.name === "speed" || input["aria-label"] === "语速"));
  assert.equal(speed.length, 2);
  for (const input of speed) {
    assert.equal(Number(input.min), 0.5);
    assert.equal(Number(input.max), 2);
    assert.equal(input.step, "0.1");
    assert.equal(input.value, "1");
  }
  const pause = inputs.find(input => input["aria-label"] === "段尾停顿");
  assert.ok(pause);
  assert.equal(pause.type, "range");
  assert.equal(pause.min, "0");
  assert.equal(pause.max, "3");
  assert.equal(pause.step, "0.5");
  assert.equal(pause.value, "1");
  assert.equal(inputs.find(input => input.name === "organizationId")?.value, "active-org");
  assert.equal(inputs.find(input => input.name === "format")?.value, "wav");
  assert.equal(inputs.find(input => input.name === "sampleRate")?.value, "24000");
  const selects = nodes.filter(node => node.tagName === "select").map(attrs);
  assert.equal(selects.some(select => ["format", "sampleRate", "billingContext", "organizationId"].includes(select.name)), false);
  const labels = nodes.filter(node => node.tagName === "label").map(text);
  assert.equal(labels.some(label => /下载格式|采样率|扣费空间/.test(label)), false);
});

test("下载格式由下载按钮的菜单选择，不再要求右栏传入格式", () => {
  const nodes = render(React.createElement(VoiceDownloadButton, { target: { task: "task-1" } }));
  const button = nodes.find(node => node.tagName === "button");
  assert.ok(button);
  assert.equal(attrs(button)["aria-haspopup"], "menu");
  assert.equal(attrs(button)["aria-label"], "下载音频");
  assert.equal(attrs(button)["aria-expanded"], "false");
});

test("多人输入提示与单人一致，右栏顶部间距和生成按钮保持统一", () => {
  const nodes = render(React.createElement(VoiceConsole, {
    currentUser: { id: "user-1", accountId: "10000", email: "test@example.com", phone: null,
      phoneVerifiedAt: null, nickname: "测试用户", avatarUrl: null, status: "ACTIVE" },
    models: [model], voices: [voice], history: [], currentTask: null, currentProject: null,
    organizations: null, createAction: () => undefined
  }));
  const dialogueInput = nodes.find(node => node.tagName === "textarea" && attrs(node)["aria-label"] === "对话原稿");
  assert.ok(dialogueInput);
  assert.equal(attrs(dialogueInput).placeholder, "请输入或粘贴要转换为语音的文字");
  assert.match(attrs(dialogueInput).class, /placeholder:text-muted-foreground/);
  assert.match(attrs(dialogueInput).class, /focus:placeholder:text-transparent/);

  const dialogueAside = nodes.find(node => node.tagName === "aside" && text(node).includes("角色映射"));
  assert.ok(dialogueAside);
  const settings = elements(dialogueAside).find(node => node.tagName === "div" && /overflow-y-auto/.test(attrs(node).class ?? ""));
  assert.ok(settings);
  assert.match(attrs(settings).class, /px-5 py-4/);
  assert.match(text(dialogueAside), /生成语音/);
  assert.doesNotMatch(text(dialogueAside), /确认生成费用|8000 字符|100 段/);
  assert.equal(elements(dialogueAside).some(node => attrs(node)["aria-label"] === "免费重新合并"), false);
});

test("单人和多人播放条不插入触发原生字幕菜单的空字幕轨道", () => {
  const nodes = render(React.createElement(VoiceConsole, {
    currentUser: null, models: [model], voices: [voice], history: [], organizations: null,
    createAction: () => undefined,
    currentTask: { id: "task-1", title: "测试音频", text: "Hello.", status: "SUCCEEDED", statusName: "已完成",
      createdAt: "2026-09-14", audioUrl: "/single.wav", voiceName: voice.name, credits: 0, errorMessage: null },
    currentProject: { ...project, audioUrl: "/dialogue.wav", outputRevision: 1 }
  }));
  const players = nodes.filter(node => node.tagName === "audio");
  assert.equal(players.length, 2);
  for (const player of players) {
    assert.equal(attrs(player).controls, "");
    assert.equal(attrs(player).controlslist, "nodownload noplaybackrate noremoteplayback");
    assert.equal(elements(player).some(node => node.tagName === "track"), false);
  }
});

test("单人输入区浅色占位、5000 字符右下角计数，右栏无声调或预估扣点，合成按钮居中", () => {
  const nodes = render(React.createElement(VoiceConsole, {
    currentUser: { id: "user-1", accountId: "10000", email: "test@example.com", phone: null,
      phoneVerifiedAt: null, nickname: "测试用户", avatarUrl: null, status: "ACTIVE" },
    models: [model], voices: [voice], history: [], organizations: null, createAction: () => undefined,
    currentTask: { id: "task-1", title: "测试", text: "123456789", status: "PENDING", statusName: "待生成",
      createdAt: "2026-09-14", audioUrl: null, voiceName: voice.name, credits: 0, errorMessage: null }
  }));
  const form = nodes.find(node => node.tagName === "form");
  assert.ok(form);
  const create = nodes.find(node => node.tagName === "a" && attrs(node).href === "/voice");
  assert.ok(create);
  assert.equal(text(create), "新建生成");
  assert.equal(attrs(create)["aria-label"], "新建生成");
  const icon = elements(create).find(node => node.tagName === "svg");
  assert.ok(icon);
  assert.match(attrs(icon).class, /lucide-plus/);
  assert.equal(attrs(icon)["data-icon"], "inline-start");
  const textarea = elements(form).find(node => node.tagName === "textarea");
  assert.ok(textarea);
  assert.equal(attrs(textarea).placeholder, "请输入或粘贴要转换为语音的文字");
  assert.equal(attrs(textarea).maxlength, "5000");
  assert.match(attrs(textarea).class, /placeholder:text-muted-foreground/);
  assert.match(attrs(textarea).class, /focus:placeholder:text-transparent/);
  assert.equal(text(textarea), "123456789");
  const counter = elements(form).find(node => attrs(node)["aria-label"] === "字符计数");
  assert.ok(counter);
  assert.equal(text(counter), "9 / 5,000 字符");
  assert.match(attrs(counter).class, /absolute bottom-4 right-6/);
  const aside = elements(form).find(node => node.tagName === "aside");
  assert.ok(aside);
  assert.doesNotMatch(text(aside), /声调|语言|计费字符|预估|预计扣点|5,000 字符|生成音频/);
  const inputs = elements(aside).filter(node => node.tagName === "input").map(attrs);
  assert.equal(inputs.find(input => input.name === "pitch")?.type, "hidden");
  const volume = inputs.find(input => input.name === "volume");
  assert.ok(volume);
  assert.equal(volume.min, "0.5");
  assert.equal(volume.max, "2");
  assert.equal(volume.step, "0.1");
  assert.equal(volume.value, "1");
  assert.equal(inputs.find(input => input.name === "speed")?.value, "1");
  assert.equal(inputs.find(input => input.name === "languageDetection")?.type, "hidden");
  assert.equal(inputs.find(input => input.name === "languageDetection")?.value, "auto");
  assert.equal(elements(aside).some(node => node.tagName === "select"), false);
  const submit = elements(aside).find(node => node.tagName === "button" && attrs(node).type === "submit");
  assert.ok(submit);
  assert.equal(text(submit), "生成语音");
  assert.match(attrs(submit.parentNode as DefaultTreeAdapterMap["element"]).class, /justify-center/);
});

test("旧版语音历史保留播放器，缺失素材明确提示且不将历史费用显示为零", () => {
  const base = { id: "legacy-1", title: "旧版语音", text: "历史正文", status: "SUCCEEDED", statusName: "已完成", createdAt: "2026-10-08", voiceName: "旧版音色", credits: 0, errorMessage: null, legacyImport: true };
  const playable = render(React.createElement(VoiceConsole, { currentUser: null, models: [model], voices: [voice], history: [], organizations: null, createAction: () => undefined, currentTask: { ...base, audioUrl: "https://fixture.invalid/legacy.mp3" } }));
  assert.equal(playable.some(n => n.tagName === "audio" && attrs(n).src === "https://fixture.invalid/legacy.mp3"), true);
  assert.equal(playable.some(n => text(n).includes("消耗 0 点")), false);
  const missing = render(React.createElement(VoiceConsole, { currentUser: null, models: [model], voices: [voice], history: [], organizations: null, createAction: () => undefined, currentTask: { ...base, audioUrl: null, errorMessage: "旧版音频尚未同步到 R2。" } }));
  assert.equal(missing.some(n => text(n).includes("旧版音频尚未同步到 R2。")), true);
  assert.equal(missing.some(n => text(n).includes("刷新后可查看最新播放结果")), false);
});
