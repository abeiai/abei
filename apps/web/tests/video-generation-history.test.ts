import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { videoHistoryStorageKey } from "../src/lib/video-generation-history.js";

test("视频生成浏览器历史按账号和学习者身份严格隔离", () => {
  const keys = [
    videoHistoryStorageKey({ mode: "GUEST" }),
    videoHistoryStorageKey({ mode: "ACCOUNT", userId: "user-1" }),
    videoHistoryStorageKey({ mode: "LEARNER", userId: "user-1", learnerId: "learner-1" }),
    videoHistoryStorageKey({ mode: "LEARNER", userId: "user-1", learnerId: "learner-2" }),
    videoHistoryStorageKey({ mode: "ACCOUNT", userId: "user-2" })
  ];

  assert.equal(new Set(keys).size, keys.length);
  assert.match(keys[1] ?? "", /:account:/u);
  assert.match(keys[2] ?? "", /:learner:/u);
});

test("视频页面用服务端身份派生 key 且组件只读写该 key", () => {
  const pageSource = readFileSync(
    new URL("../src/app/experience/video/page.tsx", import.meta.url),
    "utf8"
  );
  const consoleSource = readFileSync(
    new URL("../src/components/experience/video-generation-console.tsx", import.meta.url),
    "utf8"
  );
  const taskRouteSource = readFileSync(
    new URL("../src/app/api/ai/video/tasks/[taskId]/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(pageSource, /videoHistoryStorageKey\(/u);
  assert.match(pageSource, /profile\.home\.learner\.id/u);
  assert.match(
    pageSource,
    /profile\.mode === "GUEST"\s*\? getOptionalCurrentUser\(\)\s*:\s*getCurrentUser\("\/experience\/video"\)/u
  );
  assert.match(consoleSource, /localStorage\.getItem\(historyStorageKey\)/u);
  assert.match(consoleSource, /localStorage\.setItem\(historyStorageKey/u);
  assert.match(consoleSource, /video\/tasks\/\$\{encodeURIComponent\(job\.id\)\}/u);
  assert.doesNotMatch(taskRouteSource, /modelInstanceId/u);
  assert.doesNotMatch(consoleSource, /const historyKey = "xueleai:experience-video:history"/u);
});
