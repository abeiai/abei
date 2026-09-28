import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeNarrationGenerationCheckpoint,
  mergeNarrationGenerationCheckpointContent,
  narrationGenerationCheckpointFromContent,
  narrationGenerationSourceHash
} from "../src/video-guide/video-guide-narration-checkpoint.js";

const cues = [
  {
    sentenceId: "s_001",
    text: "The yogurt is thick enough.",
    timeRange: "00:00 - 00:03",
    startSeconds: 0,
    endSeconds: 3
  },
  {
    sentenceId: "s_002",
    text: "It is ready to go into pots.",
    timeRange: "00:03 - 00:06",
    startSeconds: 3,
    endSeconds: 6
  }
];

const introNode = {
  id: "intro",
  type: "INTRO" as const,
  title: "导入讲解",
  script: "今天我们一起看看酸奶是怎样装进小罐里的。",
  chunks: []
};

const firstSentenceNode = {
  id: "s_001",
  type: "SENTENCE" as const,
  title: "第 1 句",
  sentenceId: "s_001",
  subtitle: cues[0]!.text,
  script: "这里是在判断酸奶是否已经足够浓稠。",
  chunks: []
};

test("导学文案检查点指纹稳定且字幕变化后失效", () => {
  const sourceHash = narrationGenerationSourceHash("Yoghurt", cues);

  assert.equal(sourceHash, narrationGenerationSourceHash("Yoghurt", cues));
  assert.notEqual(
    sourceHash,
    narrationGenerationSourceHash("Yoghurt", [
      cues[0]!,
      {
        ...cues[1]!,
        text: "It is now ready to go into pots."
      }
    ])
  );
  assert.notEqual(sourceHash, narrationGenerationSourceHash("Strawberry Yoghurt", cues));
  assert.notEqual(sourceHash, narrationGenerationSourceHash("Yoghurt ", cues));
});

test("每次成功结果合并到同一检查点并保留首次模型元数据", () => {
  const sourceHash = narrationGenerationSourceHash("Yoghurt", cues);
  const first = mergeNarrationGenerationCheckpoint(null, {
    sourceHash,
    batchSize: 4,
    totalBatches: 1,
    nodes: [introNode],
    metadata: {
      modelName: "qwen-plus",
      providerName: "aliyun",
      taskId: "task-intro"
    },
    now: "2026-07-16T00:00:00.000Z"
  });
  const second = mergeNarrationGenerationCheckpoint(first, {
    sourceHash,
    batchSize: 4,
    totalBatches: 1,
    nodes: [firstSentenceNode],
    metadata: {
      modelName: "qwen-flash",
      providerName: "aliyun",
      taskId: "task-batch"
    },
    now: "2026-07-16T00:01:00.000Z"
  });

  assert.deepEqual(second.nodes.map((node) => node.id), ["intro", "s_001"]);
  assert.deepEqual(second.metadata, {
    modelName: "qwen-plus",
    providerName: "aliyun",
    taskId: "task-intro"
  });
  assert.equal(second.updatedAt, "2026-07-16T00:01:00.000Z");
});

test("首个没有元数据的结果不会阻止后续成功调用补入模型信息", () => {
  const sourceHash = narrationGenerationSourceHash("Yoghurt", cues);
  const first = mergeNarrationGenerationCheckpoint(null, {
    sourceHash,
    batchSize: 4,
    totalBatches: 1,
    nodes: [introNode],
    now: "2026-07-16T00:00:00.000Z"
  });
  const second = mergeNarrationGenerationCheckpoint(first, {
    sourceHash,
    batchSize: 4,
    totalBatches: 1,
    nodes: [firstSentenceNode],
    metadata: {
      modelName: "qwen-plus",
      providerName: "aliyun",
      taskId: "task-batch"
    },
    now: "2026-07-16T00:01:00.000Z"
  });

  assert.deepEqual(second.metadata, {
    modelName: "qwen-plus",
    providerName: "aliyun",
    taskId: "task-batch"
  });
});

test("相同节点重新生成时覆盖旧内容而不产生重复节点", () => {
  const sourceHash = narrationGenerationSourceHash("Yoghurt", cues);
  const first = mergeNarrationGenerationCheckpoint(null, {
    sourceHash,
    batchSize: 4,
    totalBatches: 1,
    nodes: [firstSentenceNode],
    now: "2026-07-16T00:00:00.000Z"
  });
  const second = mergeNarrationGenerationCheckpoint(first, {
    sourceHash,
    batchSize: 4,
    totalBatches: 1,
    nodes: [
      {
        ...firstSentenceNode,
        script: "更新后的讲解。"
      }
    ],
    now: "2026-07-16T00:01:00.000Z"
  });

  assert.equal(second.nodes.length, 1);
  assert.equal(second.nodes[0]?.script, "更新后的讲解。");
});

test("只读取指纹匹配且结构完整的检查点", () => {
  const sourceHash = narrationGenerationSourceHash("Yoghurt", cues);
  const checkpoint = mergeNarrationGenerationCheckpoint(null, {
    sourceHash,
    batchSize: 4,
    totalBatches: 1,
    nodes: [introNode],
    now: "2026-07-16T00:00:00.000Z"
  });
  const content = mergeNarrationGenerationCheckpointContent(
    {
      summary: "保留课件已有内容"
    },
    checkpoint
  );

  assert.equal(content.summary, "保留课件已有内容");
  assert.deepEqual(narrationGenerationCheckpointFromContent(content, sourceHash), checkpoint);
  assert.equal(narrationGenerationCheckpointFromContent(content, "different-hash"), null);
  assert.equal(
    narrationGenerationCheckpointFromContent(
      {
        narrationGenerationCheckpoint: {
          ...checkpoint,
          nodes: [{ id: "broken" }]
        }
      },
      sourceHash
    ),
    null
  );
});

test("拒绝节点身份冲突、重复 ID 和无效批次数的检查点", () => {
  const sourceHash = narrationGenerationSourceHash("Yoghurt", cues);
  const checkpoint = mergeNarrationGenerationCheckpoint(null, {
    sourceHash,
    batchSize: 4,
    totalBatches: 1,
    nodes: [introNode, firstSentenceNode],
    now: "2026-07-16T00:00:00.000Z"
  });
  const malformedCheckpoints = [
    {
      ...checkpoint,
      nodes: [introNode, { ...introNode }]
    },
    {
      ...checkpoint,
      nodes: [{ ...firstSentenceNode, sentenceId: "s_999" }]
    },
    {
      ...checkpoint,
      nodes: [{ ...introNode, id: "not-intro" }]
    },
    {
      ...checkpoint,
      nodes: [{ ...firstSentenceNode, id: "" }]
    },
    {
      ...checkpoint,
      totalBatches: 0
    },
    {
      ...checkpoint,
      batchSize: 8
    }
  ];

  malformedCheckpoints.forEach((malformed) => {
    assert.equal(
      narrationGenerationCheckpointFromContent(
        {
          narrationGenerationCheckpoint: malformed
        },
        sourceHash
      ),
      null
    );
  });
});

test("检查点合并入口拒绝无法被恢复读取的参数", () => {
  const sourceHash = narrationGenerationSourceHash("Yoghurt", cues);
  const validInput = {
    sourceHash,
    batchSize: 4,
    totalBatches: 1,
    nodes: [introNode],
    now: "2026-07-16T00:00:00.000Z"
  };

  assert.throws(
    () => mergeNarrationGenerationCheckpoint(null, { ...validInput, batchSize: 8 }),
    /批次大小必须固定为 4/
  );
  assert.throws(
    () => mergeNarrationGenerationCheckpoint(null, { ...validInput, totalBatches: 0 }),
    /总批次数无效/
  );
  assert.throws(
    () =>
      mergeNarrationGenerationCheckpoint(null, {
        ...validInput,
        nodes: [introNode, { ...introNode }]
      }),
    /节点结构无效/
  );
});
