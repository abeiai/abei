import assert from "node:assert/strict";
import test from "node:test";

import {
  cumulativeNarrationTtsBilledCredits,
  narrationTtsAttemptActualCredits,
  narrationTtsBillingRevision,
  narrationTtsCreditsForCompletedNodes,
  remainingNarrationTtsCredits,
  successfulNarrationNodeIds
} from "../src/video-guide/video-guide-narration-billing.js";

const nodes = [
  { id: "intro", script: "a".repeat(900) },
  { id: "s_001", script: "b".repeat(900) }
];

test("失败任务只结算已经完成节点对应的累计点数", () => {
  const completedCredits = narrationTtsCreditsForCompletedNodes(
    nodes,
    new Set(["intro"]),
    { baseCredits: 20, creditsPerThousandCharacters: 8 }
  );

  assert.equal(completedCredits, 28);
  assert.equal(
    narrationTtsAttemptActualCredits({
      billedCreditsBeforeAttempt: 0,
      cumulativeCompletedCredits: completedCredits,
      totalCredits: 36
    }),
    28
  );
});

test("断点重试只预估尚未结算的点数且累计不超过全量报价", () => {
  const billedCredits = cumulativeNarrationTtsBilledCredits({
    billedCreditsBeforeAttempt: 40,
    latestAttemptConsumedCredits: 116,
    totalCredits: 196
  });

  assert.equal(billedCredits, 156);
  assert.equal(remainingNarrationTtsCredits(196, billedCredits), 40);
  assert.equal(
    narrationTtsAttemptActualCredits({
      billedCreditsBeforeAttempt: billedCredits,
      cumulativeCompletedCredits: 196,
      totalCredits: 196
    }),
    40
  );
  assert.equal(cumulativeNarrationTtsBilledCredits({
    billedCreditsBeforeAttempt: 190,
    latestAttemptConsumedCredits: 20,
    totalCredits: 196
  }), 196);
});

test("旧失败任务没有实际消费流水时重新生成仍按整份报价", () => {
  const billedCredits = cumulativeNarrationTtsBilledCredits({
    billedCreditsBeforeAttempt: 0,
    latestAttemptConsumedCredits: 0,
    totalCredits: 196
  });

  assert.equal(billedCredits, 0);
  assert.equal(remainingNarrationTtsCredits(196, billedCredits), 196);
});

test("重试没有新增成功节点时保留更早任务已经结算的累计点数", () => {
  const billedCredits = cumulativeNarrationTtsBilledCredits({
    billedCreditsBeforeAttempt: 28,
    latestAttemptConsumedCredits: 0,
    totalCredits: 196
  });

  assert.equal(billedCredits, 28);
  assert.equal(remainingNarrationTtsCredits(196, billedCredits), 168);
});

test("费用确认版本绑定文案、音色、模型、断点和累计已结算点数", () => {
  const first = narrationTtsBillingRevision({
    billedCredits: 156,
    checkpointId: "checkpoint-1",
    draftRevision: "a".repeat(64),
    modelAlias: "tts-default",
    totalCredits: 196,
    voice: "longxiaoxia_v3"
  });
  const changedVoice = narrationTtsBillingRevision({
    billedCredits: 156,
    checkpointId: "checkpoint-1",
    draftRevision: "a".repeat(64),
    modelAlias: "tts-default",
    totalCredits: 196,
    voice: "longwan_v3"
  });
  const changedPrice = narrationTtsBillingRevision({
    billedCredits: 156,
    checkpointId: "checkpoint-1",
    draftRevision: "a".repeat(64),
    modelAlias: "tts-default",
    totalCredits: 204,
    voice: "longxiaoxia_v3"
  });

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, changedVoice);
  assert.notEqual(first, changedPrice);
});

test("失败进度只把已完成并校验成功的语音节点计入费用", () => {
  const completed = successfulNarrationNodeIds({
    nodes: [
      { nodeId: "intro", status: "SUCCEEDED" },
      { nodeId: "s_001", status: "FAILED" },
      { nodeId: "s_002", status: "VERIFYING" },
      { nodeId: "s_003", status: "SUCCEEDED" },
      { nodeId: "", status: "SUCCEEDED" }
    ]
  });

  assert.deepEqual([...completed], ["intro", "s_003"]);
  assert.deepEqual([...successfulNarrationNodeIds(null)], []);
});
