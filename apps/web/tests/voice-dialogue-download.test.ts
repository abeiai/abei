import assert from "node:assert/strict";
import test from "node:test";
import { boundedDialogueDownload } from "../src/lib/voice-dialogue-download";

test("下载流保留完整字节，不依赖长度响应头", async () => {
  const source = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.enqueue(new Uint8Array([4, 5])); controller.close(); } });
  assert.deepEqual(new Uint8Array(await new Response(boundedDialogueDownload(source, 5)).arrayBuffer()), new Uint8Array([1, 2, 3, 4, 5]));
});

test("无长度头的下载流累计超限时终止并取消上游", async () => {
  let cancelled = false;
  const source = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(4)); },
    cancel() { cancelled = true; }
  });
  await assert.rejects(new Response(boundedDialogueDownload(source, 5)).arrayBuffer(), /大小限制/);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  assert.equal(cancelled, true);
});
