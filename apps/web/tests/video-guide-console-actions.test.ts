import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveSubtitleWorkflowSource,
  resolveSubtitleDownloadText,
  subtitleDownloadFilename
} from "../src/lib/video-guide-console-actions.js";
import * as consoleActions from "../src/lib/video-guide-console-actions.js";

test("字幕下载保留正确扩展名并清理非法文件名", () => {
  assert.equal(subtitleDownloadFilename("Fire lesson", ".srt"), "Fire lesson.srt");
  assert.equal(subtitleDownloadFilename("lesson.ass", ".ass"), "lesson.ass");
  assert.equal(subtitleDownloadFilename("a/b", ".srt"), "a-b.srt");
});

test("字幕下载优先读取服务器文本并在失败时回退当前文本", async () => {
  assert.equal(
    await resolveSubtitleDownloadText("https://cdn.example.com/a.srt", "local", async () => "server"),
    "server"
  );
  assert.equal(
    await resolveSubtitleDownloadText("https://cdn.example.com/a.srt", "local", async () => {
      throw new Error("failed");
    }),
    "local"
  );
});

test("字幕上传和字幕生成状态互斥显示", () => {
  assert.equal(
    resolveSubtitleWorkflowSource({
      generationActive: true,
      generationProgress: 0,
      hasSubtitle: true
    }),
    "generated"
  );
  assert.equal(
    resolveSubtitleWorkflowSource({
      generationActive: false,
      generationProgress: 100,
      hasSubtitle: true
    }),
    "generated"
  );
  assert.equal(
    resolveSubtitleWorkflowSource({
      generationActive: false,
      generationProgress: 0,
      hasSubtitle: true
    }),
    "uploaded"
  );
});

test("媒体转换根据实际进度和耗时估算剩余分钟", () => {
  const estimate = (consoleActions as Record<string, unknown>).estimateMediaConversionRemainingMinutes;

  assert.equal(typeof estimate, "function");

  const estimateMinutes = estimate as (startedAtMs: number, percent: number, nowMs: number) => number | null;

  assert.equal(estimateMinutes(0, 25, 60_000), 3);
  assert.equal(estimateMinutes(0, 4, 60_000), null);
  assert.equal(estimateMinutes(0, 100, 60_000), null);
});

test("视频导学音色选项包含平台设计音色并优先用户默认音色", () => {
  const buildOptions = (consoleActions as Record<string, unknown>).buildVideoGuideVoiceOptions;

  assert.equal(typeof buildOptions, "function");

  const options = (buildOptions as (library: Record<string, unknown>) => Array<Record<string, unknown>>)({
    defaultVoice: { voiceAssetId: "platform-designed" },
    platformVoices: [
      {
        id: "platform-designed",
        name: "亲切女教师",
        providerVoiceId: "provider-designed",
        status: "READY",
        type: "DESIGNED"
      }
    ],
    systemVoices: [
      {
        avatarUrl: "https://cdn.xueleai.com/uploads/audio/voices/avatars/system-voice.jpg",
        name: "系统女声",
        providerVoiceId: "system-voice",
        status: "READY"
      }
    ]
  });

  assert.deepEqual(options.map((option) => option.value), ["voice:platform-designed", "system-voice"]);
  assert.equal(options[0]?.badge, "平台设计音色");
  assert.equal(
    options[1]?.avatarUrl,
    "https://cdn.xueleai.com/uploads/audio/voices/avatars/system-voice.jpg"
  );
});

test("历史课件音色在音色库加载后优先于默认音色恢复", () => {
  const resolveSelection = (consoleActions as Record<string, unknown>)
    .resolveVideoGuideVoiceSelection;

  assert.equal(typeof resolveSelection, "function");

  const resolveVoice = resolveSelection as (input: {
    currentVoice?: string;
    preferredVoice?: string;
    voices: Array<{ isDefault?: boolean; value: string }>;
  }) => string;
  const voices = [
    { isDefault: true, value: "default-system-voice" },
    { value: "voice:platform-designed" }
  ];

  assert.equal(
    resolveVoice({
      currentVoice: "default-system-voice",
      preferredVoice: "voice:platform-designed",
      voices
    }),
    "voice:platform-designed"
  );
  assert.equal(
    resolveVoice({
      currentVoice: "voice:removed-asset",
      preferredVoice: "voice:removed-asset",
      voices
    }),
    "default-system-voice"
  );
});
