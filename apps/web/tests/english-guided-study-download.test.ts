import assert from "node:assert/strict";
import test from "node:test";
import { createEnglishGuidedStudyMaterial, type EnglishNarrationNode } from "../src/lib/english-guided-study-data";
import { courseSubtitleDownload } from "../src/lib/english-guided-study-download";

const implementation = () => import("../src/lib/english-guided-study-download").catch(() => null);

const subtitleMaterial = () => createEnglishGuidedStudyMaterial({ title: "春天", sourceText: "Spring is here.", sourceType: "TEXT",
  sourceName: null, standardName: "CEFR", levelOption: { label: "A1", aiLevel: "E1", note: "" } });

test("讲解 LRC 使用语音节点文稿，累计时间包含导语、正文和结束语", () => {
  const material = subtitleMaterial();
  material.audioUrl = "intro.mp3";
  material.narration = "重新编辑但尚未合成的文稿";
  material.narrationTimelineV2 = { version: 2, nodes: ["INTRO", "SENTENCE", "SUMMARY"].map((type, index) => ({
    id: String(index), type: type as EnglishNarrationNode["type"], sentenceId: null, chunkType: "CONTEXT", focus: null,
    audioTaskId: "task", audioUrl: `${index}.mp3`, durationMs: [59995, 1010, 2000][index]!, script: ["欢迎\n学习", "Spring is here. 春天来了。", "回顾重点"][index]!
  })) };
  assert.deepEqual(courseSubtitleDownload(material, "narration"), { filename: "春天-讲解语音.lrc",
    text: "[00:00.00]欢迎 学习\r\n[01:00.00]Spring is here. 春天来了。\r\n[01:01.01]回顾重点\r\n[01:03.01]\r\n" });
  material.narrationTimelineV2.nodes[1]!.durationMs = NaN;
  assert.equal(courseSubtitleDownload(material, "narration"), null);
});

test("示范 LRC 保留已有标题、作者和正文时间，上传文件沿用音频文件名", () => {
  const material = subtitleMaterial();
  material.readAlong = { version: 2, source: "UPLOAD", audioUrl: "reading.mp3", audioName: "我的朗读.mp3", audioAssetId: null,
    durationMs: 15000, voice: null, srtText: "", nodes: [], cues: ["TITLE", "AUTHOR", "BODY"].map((unitType, index) => ({
      id: String(index), unitId: String(index), unitType: unitType as "TITLE" | "AUTHOR" | "BODY", sentenceId: null,
      text: ["Spring", "An Author", "Spring is here."][index]!, startSeconds: [1.25, 4, 10][index]!, endSeconds: [3, 6, 15][index]!,
      timingSource: "ASR_WORDS", words: []
    })) };
  const file = courseSubtitleDownload(material, "demonstration");
  assert.equal(file?.filename, "我的朗读.lrc");
  assert.equal(file?.text, "[00:01.25]Spring\r\n[00:03.00]\r\n[00:04.00]An Author\r\n[00:06.00]\r\n[00:10.00]Spring is here.\r\n[00:15.00]\r\n");
  material.readAlong.source = "GENERATED";
  assert.equal(courseSubtitleDownload(material, "demonstration")?.filename, "春天-示范语音.lrc");
  material.readAlong.cues = [];
  assert.equal(courseSubtitleDownload(material, "demonstration"), null);
});

test("没有对应音频时不提供字幕下载", () => {
  assert.equal(courseSubtitleDownload(null, "narration"), null);
  assert.equal(courseSubtitleDownload(subtitleMaterial(), "narration"), null);
  assert.equal(courseSubtitleDownload(subtitleMaterial(), "demonstration"), null);
});

test("课件音频代理保留身份和文件格式，拒绝非音频和非法参数", async () => {
  const module = await implementation(); assert.ok(module, "课件下载代理已实现");
  const request = new Request("http://localhost:3321/api/test", { headers: { cookie: "session=fixture", authorization: "Bearer fixture" } });
  let calls = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    calls++;
    assert.match(String(url), /materials\/lesson-1\/audio-download\/demonstration$/);
    assert.equal(new Headers(init?.headers).get("cookie"), "session=fixture");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture");
    return new Response("original", { headers: { "content-type": "audio/mp4", "content-disposition": "attachment; filename*=UTF-8''original.m4a" } });
  };
  const response = await module.proxyCourseAudioDownload(request, "lesson-1", "demonstration", { fetchImpl });
  assert.equal(response.headers.get("content-type"), "audio/mp4");
  assert.equal(await response.text(), "original");
  assert.equal((await module.proxyCourseAudioDownload(request, "../secret", "demonstration", { fetchImpl })).status, 400);
  assert.equal(calls, 1);
  assert.equal((await module.proxyCourseAudioDownload(request, "lesson-1", "narration", { fetchImpl: async () => new Response("<html>", { headers: { "content-type": "text/html" } }) })).status, 502);
});

test("前端音频下载保留原始字节、中文文件名并显示后端错误", async () => {
  const module = await implementation(); assert.ok(module);
  const result = await module.fetchCourseAudioDownload("lesson-1", "narration", undefined, async () => new Response("audio", { headers: {
    "content-type": "audio/mpeg", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent("春天-讲解语音.mp3")}`
  } }));
  assert.equal(result.filename, "春天-讲解语音.mp3");
  assert.equal(await result.blob.text(), "audio");
  await assert.rejects(module.fetchCourseAudioDownload("lesson-1", "narration", undefined, async () => Response.json({ message: "请先登录" }, { status: 401 })), /请先登录/);
});
