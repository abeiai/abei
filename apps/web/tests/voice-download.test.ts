import assert from "node:assert/strict";
import test from "node:test";
import { createDialogueDraft } from "../src/lib/voice-dialogue";

const implementation = () => import("../src/lib/voice-download").catch(() => null);

test("download choices format actual file sizes in bytes, KB and MB", async () => {
  const module = await implementation();
  assert.ok(module);
  assert.equal(module.formatVoiceDownloadSize(512), "512 B");
  assert.equal(module.formatVoiceDownloadSize(1024), "1 KB");
  assert.equal(module.formatVoiceDownloadSize(32300), "31.54 KB");
  assert.equal(module.formatVoiceDownloadSize(1024 * 1024), "1 MB");
  assert.equal(module.formatVoiceDownloadSize(1.5 * 1024 * 1024), "1.5 MB");
});

test("new dialogue drafts synthesize WAV masters independently of download format", () => {
  assert.equal(createDialogueDraft().format, "wav");
});

test("voice download paths reject arbitrary URLs, duplicate/ambiguous targets and invalid formats", async () => {
  const module = await implementation();
  assert.ok(module, "download helpers exist");
  assert.equal(module.voiceDownloadPath(new URLSearchParams("task=task-1&format=wav")), "/audio/voice-download?task=task-1&format=wav");
  assert.equal(module.voiceDownloadPath(new URLSearchParams("project=project-1&revision=2")), "/audio/voice-download?project=project-1&revision=2&format=mp3");
  for (const query of ["url=https://evil.example", "task=x&task=y", "task=x&project=y&revision=1", "task=../x", "task=x&format=opus", "project=x&revision=0", "project=x&revision=1.5", "task=x&revision=1", "task=x&format=mp3&format=wav"]) {
    assert.equal(module.voiceDownloadPath(new URLSearchParams(query)), null, query);
  }
});

test("binary proxy forwards signed profile cookies, streams requested format and preserves attachment", async () => {
  const module = await implementation();
  assert.ok(module);
  const request = new Request("http://localhost:3321/voice/download?task=task-1&format=wav", { headers: { cookie: "session=test; profile=signed", authorization: "Bearer fixture" } });
  const output = await module.proxyVoiceDownload(request, { fetchImpl: async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), "http://localhost:3322/api/audio/voice-download?task=task-1&format=wav");
    assert.equal(new Headers(init?.headers).get("cookie"), "session=test; profile=signed");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture");
    assert.equal(init?.redirect, "error");
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/wav", "Content-Disposition": 'attachment; filename="voice-asset.wav"', "Content-Length": "3" } });
  } });
  assert.equal(output.headers.get("content-type"), "audio/wav");
  assert.equal(output.headers.get("content-disposition"), 'attachment; filename="voice-asset.wav"');
  assert.deepEqual(new Uint8Array(await output.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test("binary proxy preserves auth/revision errors, rejects wrong MIME and cancels oversized bodies", async () => {
  const module = await implementation();
  assert.ok(module);
  const request = () => new Request("http://localhost:3321/voice/download?project=project-1&revision=2&format=mp3");
  for (const status of [401, 403, 409]) {
    const output = await module.proxyVoiceDownload(request(), { fetchImpl: async () => Response.json({ code: 40901, message: "请重新登录或刷新记录", data: null }, { status }) });
    assert.equal(output.status, status);
    assert.equal((await output.json()).data, null);
  }
  const wrong = await module.proxyVoiceDownload(request(), { fetchImpl: async () => new Response("html", { headers: { "Content-Type": "text/html" } }) });
  assert.equal(wrong.status, 502);
  let cancelled = false;
  const large = await module.proxyVoiceDownload(request(), { fetchImpl: async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } }), { headers: { "Content-Type": "audio/mpeg", "Content-Disposition": 'attachment; filename="voice-asset.mp3"' } }) });
  await assert.rejects(large.arrayBuffer(), /大小限制/);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  assert.equal(cancelled, true);
});

test("client download acquires requested file and reports friendly errors instead of opening JSON", async () => {
  const module = await implementation();
  assert.ok(module);
  const file = await module.fetchVoiceDownload("/voice/download?task=x&format=wav", "wav", undefined, async () => new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "audio/wav", "Content-Disposition": 'attachment; filename="voice-test.wav"' } }));
  assert.equal(file.filename, "voice-test.wav");
  assert.equal(file.blob.type, "audio/wav");
  assert.equal(file.blob.size, 2);
  await assert.rejects(module.fetchVoiceDownload("/voice/download?task=x", "mp3", undefined, async () => Response.json({ message: "请先登录" }, { status: 401 })), /登录/);
});
