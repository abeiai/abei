import assert from "node:assert/strict";
import test from "node:test";

import {
  EnglishGuidedStudyService,
  englishGuidedStudyContentBatchResults,
  englishGuidedStudyRecoveryStaleMs,
  englishGuidedStudyRecoverySweepMs
} from "../src/english-guided-study/english-guided-study.service.js";
import {
  englishGuidedStudyMaterialPromptVersion,
  gushiwenGuidedStudyMaterialPromptVersion
} from "../src/ai/ai.service.js";

const courseReviewService = {
  recordMaterialChange: async () => undefined
};

test("英文带学以最多两个并发批次生成并按完成句数报告进度", async () => {
  let activeCalls = 0;
  let maxActiveCalls = 0;
  let totalAiCalls = 0;
  const requestedBatchSizes: number[] = [];
  const titleContextsByFirstSegment = new Map<string, string>();
  const progressMessages: string[] = [];
  const checkpoints = new Map<number, {
    taskId: string;
    providerName: string | null;
    modelName: string | null;
    text: string;
  }>();
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: {
      variables: { sourceSegmentsJson: string; titleAnalysisContext: string };
    }) => {
      const segments = JSON.parse(input.variables.sourceSegmentsJson) as Array<{
        id: string;
        text: string;
      }>;
      requestedBatchSizes.push(segments.length);
      titleContextsByFirstSegment.set(
        segments[0]?.id ?? "",
        input.variables.titleAnalysisContext
      );
      totalAiCalls += 1;
      activeCalls += 1;
      maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeCalls -= 1;

      return {
        taskId: `task-${totalAiCalls}`,
        providerName: "test-provider",
        modelName: "test-model",
        text: JSON.stringify({
          title: "并发生成测试",
          contentType: "GENERAL",
          summary: `这是 ${segments[0]?.id} 的简短导语。`,
          closing: `这是 ${segments.at(-1)?.id} 的总结结束语。`,
          sentences: segments.map((segment) => ({
            segmentId: segment.id,
            script: `我们一起看这一句。这里需要理解句子的主要意思，并注意它与上下文的联系：${segment.text}`,
            points: []
          }))
        })
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    aiService as never,
    courseReviewService as never
  );
  const sourceSegments = Array.from({ length: 17 }, (_, index) => ({
    id: `s${index + 1}`,
    text: `Sentence ${index + 1}.`
  }));
  const generateMaterialContent = (
    service as unknown as {
      generateMaterialContent: (input: Record<string, unknown>) => Promise<{
        closing: string;
        narration: string;
        sentences: Array<{ id: string }>;
        summary: string;
      }>;
    }
  ).generateMaterialContent.bind(service);

  const generationInput = {
    userId: "user-1",
    inputLabel: "并发生成测试",
    maxTokens: 8_000,
    aiLevel: "E1",
    explanationMode: "SENTENCE",
    levelOptionLabel: "小学三四年级",
    levelStandardName: "基于所在学段年级",
    levelProfile: "中文为主，耐心讲解。",
    sourceSegments,
    sourceName: null,
    sourceText: sourceSegments.map((segment) => segment.text).join(" "),
    sourceType: "TEXT",
    title: "并发生成测试",
    referenceMaterials: [],
    onProgress: async (progress: { message: string }) => {
      progressMessages.push(progress.message);
    },
    onBatchCompleted: async (
      batchIndex: number,
      result: {
        taskId: string;
        providerName: string | null;
        modelName: string | null;
        text: string;
      }
    ) => {
      checkpoints.set(batchIndex, result);
    }
  };
  const content = await generateMaterialContent(generationInput);

  assert.deepEqual(requestedBatchSizes.sort((left, right) => right - left), [8, 8, 1]);
  assert.equal(titleContextsByFirstSegment.get("s1"), generationInput.sourceText);
  assert.equal(titleContextsByFirstSegment.get("s9"), "当前批次不需要生成标题导语");
  assert.equal(titleContextsByFirstSegment.get("s17"), "当前批次不需要生成标题导语");
  assert.equal(maxActiveCalls, 2);
  assert.equal(content.sentences.length, 17);
  assert.equal(content.summary, "这是 s1 的简短导语。");
  assert.equal(content.closing, "这是 s17 的总结结束语。");
  assert.equal(content.narration.startsWith(content.summary), true);
  assert.equal(content.narration.includes("今天我们学习《"), false);
  assert.equal(content.narration.endsWith(content.closing), true);
  assert.equal(checkpoints.size, 3);
  assert.match(progressMessages.join("\n"), /已完成 8\/17 句/);
  assert.match(progressMessages.join("\n"), /已完成 17\/17 句/);

  const callsBeforeResume = totalAiCalls;
  const resumed = await generateMaterialContent({
    ...generationInput,
    existingBatchResults: checkpoints,
    onBatchCompleted: async () => {
      throw new Error("恢复时不应重复保存已经完成的批次");
    }
  });

  assert.equal(totalAiCalls, callsBeforeResume);
  assert.equal(resumed.sentences.length, 17);
});

test("英文带学只复用当前提示词版本生成的批次检查点", () => {
  const checkpoint = {
    batchIndex: 0,
    modelName: "test-model",
    providerName: "test-provider",
    taskId: "task-1",
    text: "{}"
  };

  assert.equal(
    englishGuidedStudyContentBatchResults({
      generatedBatches: [{ ...checkpoint, promptVersion: "2026.08.11-content-title-v18" }]
    }).size,
    0
  );
  assert.equal(
    englishGuidedStudyContentBatchResults({
      generatedBatches: [{ ...checkpoint, promptVersion: englishGuidedStudyMaterialPromptVersion }]
    }).size,
    1
  );
  assert.equal(
    englishGuidedStudyContentBatchResults({
      scene: "GUSHIWEN",
      generatedBatches: [{ ...checkpoint, promptVersion: englishGuidedStudyMaterialPromptVersion }]
    }).size,
    0
  );
  assert.equal(
    englishGuidedStudyContentBatchResults({
      scene: "GUSHIWEN",
      generatedBatches: [{ ...checkpoint, promptVersion: gushiwenGuidedStudyMaterialPromptVersion }]
    }).size,
    1
  );
});

test("英文带学按整篇校验中文比例，不因单个批次偏英文而中断", async () => {
  let totalAiCalls = 0;
  const checkpoints = new Set<number>();
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: {
      variables: { sourceSegmentsJson: string };
    }) => {
      const segments = JSON.parse(input.variables.sourceSegmentsJson) as Array<{
        id: string;
        text: string;
      }>;
      const englishHeavyBatch = segments[0]?.id === "s9";
      totalAiCalls += 1;

      return {
        taskId: `task-${totalAiCalls}`,
        providerName: "test-provider",
        modelName: "test-model",
        text: JSON.stringify({
          title: "整篇比例校验测试",
          contentType: "GENERAL",
          summary: "测试整篇语言比例校验。",
          sentences: segments.map((segment) => ({
            segmentId: segment.id,
            script: englishHeavyBatch
              ? `Let's examine the meaning, structure, context, and tone of ${segment.text}`
              : `这里先用中文讲清楚主要意思、上下文联系和表达作用，再结合原句 ${segment.text} 做简短确认。`,
            points: []
          }))
        })
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    aiService as never,
    courseReviewService as never
  );
  const sourceSegments = Array.from({ length: 24 }, (_, index) => ({
    id: `s${index + 1}`,
    text: `Sentence ${index + 1}.`
  }));
  const generateMaterialContent = (
    service as unknown as {
      generateMaterialContent: (input: Record<string, unknown>) => Promise<{
        sentences: Array<{ id: string }>;
      }>;
    }
  ).generateMaterialContent.bind(service);

  const content = await generateMaterialContent({
    userId: "user-1",
    inputLabel: "整篇比例校验测试",
    maxTokens: 8_000,
    aiLevel: "E6",
    explanationMode: "SENTENCE",
    levelOptionLabel: "高三高考",
    levelStandardName: "基于所在学段年级",
    levelProfile: "英文为主，同时保留必要的中文支持。",
    sourceSegments,
    sourceName: null,
    sourceText: sourceSegments.map((segment) => segment.text).join(" "),
    sourceType: "TEXT",
    title: "整篇比例校验测试",
    referenceMaterials: [],
    onBatchCompleted: async (batchIndex: number) => {
      checkpoints.add(batchIndex);
    }
  });

  assert.equal(content.sentences.length, 24);
  assert.equal(totalAiCalls, 4);
  assert.equal(checkpoints.size, 3);
});

for (const [label, initialValid, repairSucceeds] of [
  ["合格长讲稿完整保留且不额外调用模型", true, true],
  ["全文比例达标仍纠偏纯英文段落", false, true],
  ["纠偏仍不合格时不保存成功检查点", false, false]
] as const) {
  test(`英文逐段带学${label}`, async () => {
    const longScript = "注意 swing wide open，wide 强调打开的程度，既写春天到来，也让我们看见回忆被唤醒的画面。".repeat(50);
    const sourceSegments = [{ id: "s1", text: "The doors swing wide open." }, { id: "s2", text: "I remember my old home." }];
    const policies: string[] = [];
    const modeProfiles: string[] = [];
    const requestedIds: string[][] = [];
    const saved: number[] = [];
    const service = new EnglishGuidedStudyService({} as never, {
      generateScenarioTextForExternalBilling: async ({ variables }: { variables: { languagePolicy: string; explanationModeProfile: string; sourceSegmentsJson: string } }) => {
        policies.push(variables.languagePolicy);
        modeProfiles.push(variables.explanationModeProfile);
        const requested = JSON.parse(variables.sourceSegmentsJson) as typeof sourceSegments;
        requestedIds.push(requested.map((segment) => segment.id));
        return {
          taskId: `task-${policies.length}`, providerName: "test", modelName: "test",
          text: JSON.stringify({
            title: "春日回忆", summary: "春天的景色把记忆唤醒了。", closing: "从眼前的景物，我们走进了过去的回忆。",
            sentences: requested.map((segment) => ({
              segmentId: segment.id,
              script: segment.id === "s1" ? longScript : initialValid || (repairSucceeds && policies.length > 1)
                ? "这里的 remember 说的是想起过去的事情。my old home 指过去住过的家，不是在说房子破旧了。作者从眼前的春色转向儿时的记忆。"
                : segment.text,
              points: [{ term: "home", meaning: "家", note: "词卡中的中文不能代替讲解。" }]
            }))
          })
        };
      }
    } as never, courseReviewService as never);
    const generate = Reflect.get(service, "generateMaterialContent").bind(service) as (input: Record<string, unknown>) => Promise<{ narration: string; sentences: Array<{ script: string }> }>;
    const result = generate({
      userId: "user-1", inputLabel: "逐段讲解测试", maxTokens: 8_000, aiLevel: "E4", scene: "ENGLISH",
      explanationMode: "PARAGRAPH", levelOptionLabel: "初二初三", levelStandardName: "基于所在学段年级",
      levelProfile: "中英文结合讲解。", sourceSegments, sourceText: sourceSegments.map((s) => s.text).join("\n\n"),
      sourceType: "TEXT", sourceName: null, title: "春日回忆", referenceMaterials: [],
      onBatchCompleted: async (index: number) => { saved.push(index); }
    });

    if (repairSucceeds) {
      const content = await result;
      assert.equal(content.sentences[0]?.script, longScript);
      assert.ok(content.narration.includes(longScript));
      assert.match(content.sentences[1]?.script ?? "", /过去住过的家/);
      assert.deepEqual(saved, [0]);
    } else {
      await assert.rejects(result, /部分段落缺少符合当前英语水平的中文讲解/);
      assert.deepEqual(saved, []);
    }
    assert.equal(policies.length, initialValid ? 1 : repairSucceeds ? 2 : 3);
    assert.match(modeProfiles[0] ?? "", /每段独立满足语言比例/);
    if (!initialValid) {
      assert.match(policies[1] ?? "", /需要补足中文讲解的片段：s2/);
      assert.ok(requestedIds.slice(1).every((ids) => ids.length === 1 && ids[0] === "s2"));
    }
  });
}

for (const firstRepair of ["ENGLISH", "INVALID_JSON", "WRONG_SEGMENT"] as const) {
  test(`英文逐段带学定向补写遇到 ${firstRepair} 后只重试失败段并保留合格文稿`, async () => {
    const sourceSegments = [{ id: "s1", text: "The doors open." }, { id: "s2", text: "We remember home." }];
    const firstScript = "这里用 doors open 写门打开的动作，也让我们感受到新生活即将开始。";
    const repairedScript = "回想一下曾经住过的地方。这里的 remember 表示想起，home 不只是房屋，也带着对家的感情。";
    const calls: Array<{ ids: string[]; policy: string; titleContext: string }> = [];
    const checkpoints = new Map<number, unknown>();
    const progress: string[] = [];
    const service = new EnglishGuidedStudyService({} as never, {
      generateScenarioTextForExternalBilling: async ({ variables }: { variables: Record<string, string> }) => {
        const segments = JSON.parse(variables.sourceSegmentsJson!) as typeof sourceSegments;
        calls.push({ ids: segments.map((s) => s.id), policy: variables.languagePolicy!, titleContext: variables.titleAnalysisContext! });
        if (calls.length === 2 && firstRepair === "INVALID_JSON") {
          return { taskId: "bad-json", text: "{}", modelName: "test", providerName: "test" };
        }
        return {
          taskId: `task-${calls.length}`, modelName: "test", providerName: "test",
          text: JSON.stringify({
            title: "回忆", summary: calls.length === 1 ? "门后藏着怎样的回忆呢？" : "不应改写原导语。",
            closing: calls.length === 1 ? "记住开门的画面和对家的感情。" : "不应改写原结束语。",
            sentences: segments.map((s) => ({
              segmentId: calls.length === 2 && firstRepair === "WRONG_SEGMENT" ? "s999" : s.id,
              script: s.id === "s1" ? firstScript : calls.length >= 3 ? repairedScript : "We remember home and think about our life in the past.",
              points: []
            }))
          })
        };
      }
    } as never, courseReviewService as never);
    const generate = Reflect.get(service, "generateMaterialContent").bind(service);
    const input = {
      userId: "user-1", inputLabel: "回忆", maxTokens: 8_000, scene: "ENGLISH", aiLevel: "E4",
      explanationMode: "PARAGRAPH", levelOptionLabel: "初二初三", levelStandardName: "基于所在学段年级", levelProfile: "中英结合。",
      title: "回忆", sourceType: "TEXT", sourceText: sourceSegments.map((s) => s.text).join("\n\n"), sourceSegments, referenceMaterials: [],
      onProgress: async (value: { message: string }) => { progress.push(value.message); },
      onBatchCompleted: async (index: number, result: unknown) => { checkpoints.set(index, result); }
    };
    const content = await generate(input);
    assert.deepEqual(calls.map((c) => c.ids), [["s1", "s2"], ["s2"], ["s2"]]);
    assert.match(calls[1]!.policy, /中文汉字数/);
    assert.notEqual(calls[1]!.titleContext, input.sourceText);
    assert.deepEqual(content.sentences.map((s: { script: string }) => s.script), [firstScript, repairedScript]);
    assert.equal(content.summary, "门后藏着怎样的回忆呢？");
    assert.equal(content.closing, "记住开门的画面和对家的感情。");
    assert.ok(content.narration.includes(repairedScript));
    assert.match(progress.join("\n"), /补充.*中文讲解/);
    const resumed = await generate({ ...input, existingBatchResults: checkpoints });
    assert.equal(calls.length, 3);
    assert.deepEqual(resumed.sentences, content.sentences);
  });
}

test("英文逐段长文按小批次生成且保持原片段顺序", async () => {
  const sourceSegments = Array.from({ length: 7 }, (_, i) => ({ id: `s${i + 1}`, text: "We remember our home. ".repeat(60) }));
  const requested: Array<typeof sourceSegments> = [];
  const service = new EnglishGuidedStudyService({} as never, {
    generateScenarioTextForExternalBilling: async ({ variables }: { variables: Record<string, string> }) => {
      const segments = JSON.parse(variables.sourceSegmentsJson!) as typeof sourceSegments;
      requested.push(segments);
      return { taskId: `task-${segments[0]!.id}`, modelName: "test", providerName: "test", text: JSON.stringify({
        title: "回忆", summary: "想起家的时候，你会想到什么？", closing: "家的回忆把这些表达串了起来。",
        sentences: segments.map((s) => ({ segmentId: s.id, script: `这里的 home 带着对家的感情。${"我们一起理解这段文字表达的思念和回忆。".repeat(20)}`, points: [] }))
      }) };
    }
  } as never, courseReviewService as never);
  const content = await Reflect.get(service, "generateMaterialContent").call(service, {
    userId: "user-1", inputLabel: "回忆", maxTokens: 8_000, scene: "ENGLISH", aiLevel: "E4",
    explanationMode: "PARAGRAPH", levelOptionLabel: "初二初三", levelStandardName: "基于所在学段年级", levelProfile: "中英结合。",
    title: "回忆", sourceType: "TEXT", sourceText: sourceSegments.map((s) => s.text).join("\n\n"), sourceSegments, referenceMaterials: []
  });
  assert.ok(requested.every((batch) => batch.length <= 3 && JSON.stringify(batch).length <= 3_500));
  assert.deepEqual(content.sentences.map((s: { id: string }) => s.id), sourceSegments.map((s) => s.id));
});

test("英文带学首次返回无效 JSON 时自动结构纠偏重试", async () => {
  let totalAiCalls = 0;
  const inputLabels: string[] = [];
  const languagePolicies: string[] = [];
  const checkpoints: string[] = [];
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: {
      input: string;
      variables: { languagePolicy: string; sourceSegmentsJson: string };
    }) => {
      totalAiCalls += 1;
      inputLabels.push(input.input);
      languagePolicies.push(input.variables.languagePolicy);
      const segments = JSON.parse(input.variables.sourceSegmentsJson) as Array<{
        id: string;
        text: string;
      }>;

      return {
        taskId: `task-${totalAiCalls}`,
        providerName: "test-provider",
        modelName: "test-model",
        text: totalAiCalls === 1
          ? '{"title":"未闭合的返回","sentences":['
          : JSON.stringify({
              title: "结构纠偏测试",
              contentType: "GENERAL",
              summary: "我们先从这句简单的问候开始。",
              closing: "这次我们理解了句子的基本意思，也留意了日常问候的表达方式。",
              sentences: segments.map((segment) => ({
                segmentId: segment.id,
                script: `我们一起看这句。先用中文理解它的主要意思，再结合原句 ${segment.text} 注意这个自然的问候表达。`,
                points: []
              }))
            })
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    aiService as never,
    courseReviewService as never
  );
  const generateMaterialContent = (
    service as unknown as {
      generateMaterialContent: (input: Record<string, unknown>) => Promise<{
        sentences: Array<{ id: string }>;
      }>;
    }
  ).generateMaterialContent.bind(service);

  const content = await generateMaterialContent({
    userId: "user-1",
    inputLabel: "结构纠偏测试",
    maxTokens: 4_000,
    aiLevel: "E1",
    explanationMode: "SENTENCE",
    levelOptionLabel: "小学三四年级",
    levelStandardName: "基于所在学段年级",
    levelProfile: "中文为主，耐心讲解。",
    sourceSegments: [{ id: "s1", text: "Hello world." }],
    sourceName: null,
    sourceText: "Hello world.",
    sourceType: "TEXT",
    title: "",
    referenceMaterials: [],
    onBatchCompleted: async (_batchIndex: number, result: { taskId: string }) => {
      checkpoints.push(result.taskId);
    }
  });

  assert.equal(totalAiCalls, 2);
  assert.deepEqual(content.sentences.map((sentence) => sentence.id), ["s1"]);
  assert.match(inputLabels[1] ?? "", /结构纠偏/);
  assert.match(languagePolicies[1] ?? "", /单个合法、完整、闭合的 JSON 对象/);
  assert.deepEqual(checkpoints, ["task-2"]);
});

test("古诗文多轮全文覆盖纠偏只把最新缺失片段写入提示词", async () => {
  let totalAiCalls = 0;
  const correctionPolicies: string[] = [];
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: {
      variables: { languagePolicy: string };
    }) => {
      totalAiCalls += 1;
      correctionPolicies.push(input.variables.languagePolicy);

      const sentences = [
        {
          segmentId: "s1",
          script: "这里的贤哉，就是多么贤德啊，句子是在赞美颜回。",
          points: [{ term: "贤哉", meaning: "多么贤德啊", note: "赞叹语气" }]
        },
        {
          segmentId: "s2",
          script: "这里的温故，就是温习学过的知识。",
          points: [{ term: "温故", meaning: "温习学过的知识", note: "学习方法" }]
        }
      ].filter((sentence) => totalAiCalls === 1
        ? sentence.segmentId !== "s1"
        : totalAiCalls === 2
          ? sentence.segmentId !== "s2"
          : true);

      return {
        taskId: `task-${totalAiCalls}`,
        providerName: "test-provider",
        modelName: "test-model",
        text: JSON.stringify({
          title: "论语选段",
          contentType: "GENERAL",
          summary: "我们来认识颜回身上值得珍视的品质。",
          closing: "理解了这份赞美，再试着把原句完整背下来。",
          sentences
        })
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    aiService as never,
    courseReviewService as never
  );
  const generateMaterialContent = (
    service as unknown as {
      generateMaterialContent: (input: Record<string, unknown>) => Promise<{
        sentences: Array<{ id: string }>;
      }>;
    }
  ).generateMaterialContent.bind(service);

  const content = await generateMaterialContent({
    userId: "user-1",
    inputLabel: "古诗文动态纠偏测试",
    maxTokens: 4_000,
    aiLevel: "G7",
    author: "孔子",
    authorIntroductionMode: "BRIEF",
    explanationMode: "SENTENCE",
    levelOptionLabel: "七年级",
    levelStandardName: "学段年级",
    levelProfile: "符合七年级理解能力。",
    scene: "GUSHIWEN",
    sourceSegments: [
      { id: "s1", text: "贤哉，回也！" },
      { id: "s2", text: "温故而知新，可以为师矣。" }
    ],
    sourceName: null,
    sourceText: "贤哉，回也！温故而知新，可以为师矣。",
    sourceType: "TEXT",
    title: "论语选段",
    referenceMaterials: []
  });

  assert.equal(totalAiCalls, 3);
  assert.deepEqual(content.sentences.map((sentence) => sentence.id), ["s1", "s2"]);
  assert.match(correctionPolicies[1] ?? "", /"issueType":"MISSING_SEGMENT"/);
  assert.match(correctionPolicies[1] ?? "", /"segmentId":"s1"/);
  assert.match(correctionPolicies[2] ?? "", /"issueType":"MISSING_SEGMENT"/);
  assert.match(correctionPolicies[2] ?? "", /"segmentId":"s2"/);
  assert.doesNotMatch(correctionPolicies[2] ?? "", /"segmentId":"s1"/);
});

test("古诗文四次校验失败后的外层重试仍携带最后一轮结构化反馈", async () => {
  let totalAiCalls = 0;
  const correctionPolicies: string[] = [];
  const sourceSegments = [
    { id: "s1", text: "学而时习之，不亦说乎？" },
    { id: "s2", text: "有朋自远方来，不亦乐乎？" },
    { id: "s3", text: "人不知而不愠，不亦君子乎？" },
    { id: "s4", text: "吾日三省吾身。" }
  ];
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: {
      variables: { languagePolicy: string };
    }) => {
      totalAiCalls += 1;
      correctionPolicies.push(input.variables.languagePolicy);
      const missingId = totalAiCalls <= 4 ? `s${totalAiCalls}` : null;

      return {
        taskId: `task-${totalAiCalls}`,
        providerName: "test-provider",
        modelName: "test-model",
        text: JSON.stringify({
          title: "论语选段",
          contentType: "GENERAL",
          summary: "我们来理解这句学习方法。",
          closing: "理解以后，再试着背出原句。",
          sentences: sourceSegments
            .filter((segment) => segment.id !== missingId)
            .map((segment) => ({
              segmentId: segment.id,
              script: `我们把${segment.text}的意思和上下文联系起来理解。`,
              points: []
            }))
        })
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    aiService as never,
    courseReviewService as never
  );
  const generateMaterialContent = (
    service as unknown as {
      generateMaterialContent: (input: Record<string, unknown>) => Promise<unknown>;
    }
  ).generateMaterialContent.bind(service);

  await generateMaterialContent({
    userId: "user-1",
    inputLabel: "古诗文外层动态纠偏测试",
    maxTokens: 4_000,
    aiLevel: "G7",
    explanationMode: "SENTENCE",
    levelOptionLabel: "七年级",
    levelStandardName: "学段年级",
    levelProfile: "符合七年级理解能力。",
    scene: "GUSHIWEN",
    sourceSegments,
    sourceName: null,
    sourceText: "学而时习之，不亦说乎？",
    sourceType: "TEXT",
    title: "论语选段",
    referenceMaterials: []
  });

  assert.equal(totalAiCalls, 5);
  assert.match(correctionPolicies[4] ?? "", /"issueType":"MISSING_SEGMENT"/);
  assert.match(correctionPolicies[4] ?? "", /"segmentId":"s4"/);
  assert.doesNotMatch(correctionPolicies[4] ?? "", /"segmentId":"s[123]"/);
});

test("古诗文忽略模型关键词 ID 并由服务端生成稳定唯一 ID", async () => {
  let totalAiCalls = 0;
  const correctionPolicies: string[] = [];
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: {
      variables: { languagePolicy: string };
    }) => {
      totalAiCalls += 1;
      correctionPolicies.push(input.variables.languagePolicy);
      const points = [
        { id: "dup", term: "时", meaning: "按时" },
        { id: "dup", term: "习", meaning: "温习和实践" }
      ];

      return {
        taskId: `task-${totalAiCalls}`,
        providerName: "test-provider",
        modelName: "test-model",
        text: JSON.stringify({
          title: "论语选段",
          contentType: "GENERAL",
          summary: "我们来理解这句学习方法。",
          closing: "理解以后，再试着背出原句。",
          sentences: [{
            segmentId: "s1",
            script: "这里的“时”，是按时；再看“习”，是温习和实践。",
            points
          }]
        })
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    aiService as never,
    courseReviewService as never
  );
  const generateMaterialContent = (
    service as unknown as {
      generateMaterialContent: (input: Record<string, unknown>) => Promise<unknown>;
    }
  ).generateMaterialContent.bind(service);

  const content = await generateMaterialContent({
    userId: "user-1",
    inputLabel: "古诗文重复 ID 纠偏测试",
    maxTokens: 4_000,
    aiLevel: "G7",
    explanationMode: "SENTENCE",
    levelOptionLabel: "七年级",
    levelStandardName: "学段年级",
    levelProfile: "符合七年级理解能力。",
    scene: "GUSHIWEN",
    sourceSegments: [{ id: "s1", text: "学而时习之，不亦说乎？" }],
    sourceName: null,
    sourceText: "学而时习之，不亦说乎？",
    sourceType: "TEXT",
    title: "论语选段",
    referenceMaterials: []
  });

  const sentences = (content as { sentences: Array<{ points: Array<{ id: string; term: string }> }> }).sentences;

  assert.equal(totalAiCalls, 1);
  assert.deepEqual(sentences[0]?.points.map((point) => [point.id, point.term]), [
    ["p1-1", "时"],
    ["p1-2", "习"]
  ]);
  assert.equal(correctionPolicies.length, 1);
});

test("古诗文纠偏元数据进入语音文稿时继续重试并要求清理全部朗读区", async () => {
  let totalAiCalls = 0;
  const correctionPolicies: string[] = [];
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: {
      variables: { languagePolicy: string };
    }) => {
      totalAiCalls += 1;
      correctionPolicies.push(input.variables.languagePolicy);
      const script = totalAiCalls === 1
        ? "本次校验反馈 JSON：{\"segmentId\":\"s1\"}。这里的“贤哉”，就是多么贤德啊。"
        : "这里的“贤哉”，就是多么贤德啊，句子是在赞美颜回。";

      return {
        taskId: `task-${totalAiCalls}`,
        providerName: "test-provider",
        modelName: "test-model",
        text: JSON.stringify({
          title: "论语选段",
          contentType: "GENERAL",
          summary: "我们来认识颜回身上值得珍视的品质。",
          closing: "理解了这份赞美，再试着把原句完整背下来。",
          sentences: [{
            segmentId: "s1",
            script,
            points: [{ term: "贤哉", meaning: "多么贤德啊", note: "赞叹语气" }]
          }]
        })
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    aiService as never,
    courseReviewService as never
  );
  const generateMaterialContent = (
    service as unknown as {
      generateMaterialContent: (input: Record<string, unknown>) => Promise<unknown>;
    }
  ).generateMaterialContent.bind(service);

  await generateMaterialContent({
    userId: "user-1",
    inputLabel: "古诗文纠偏元数据清理测试",
    maxTokens: 4_000,
    aiLevel: "G7",
    explanationMode: "SENTENCE",
    levelOptionLabel: "七年级",
    levelStandardName: "学段年级",
    levelProfile: "符合七年级理解能力。",
    scene: "GUSHIWEN",
    sourceSegments: [{ id: "s1", text: "贤哉，回也！" }],
    sourceName: null,
    sourceText: "贤哉，回也！",
    sourceType: "TEXT",
    title: "论语选段",
    referenceMaterials: []
  });

  assert.equal(totalAiCalls, 2);
  assert.match(correctionPolicies[1] ?? "", /"issueType":"FEEDBACK_METADATA_LEAK"/);
  assert.match(correctionPolicies[1] ?? "", /summary、每个 script 和 closing/);
});

test("古诗文纠偏提示词内部措辞不能进入任何语音文稿区", async () => {
  const cases = [
    { section: "SUMMARY", value: "产品规则要求先说明这一句。" },
    { section: "SCRIPT", value: "硬性纠偏：这里的“贤哉”，就是多么贤德啊。" },
    { section: "CLOSING", value: "上一次返回的 JSON 无法解析，请再背一遍。" },
    { section: "SUMMARY", value: "只针对反馈 JSON 中列出的片段来学习。" },
    { section: "SCRIPT", value: "sourceSegmentsJson 里的 segmentId 是 s1；这里的“贤哉”，就是多么贤德啊。" }
  ] as const;

  for (const testCase of cases) {
    let totalAiCalls = 0;
    const correctionPolicies: string[] = [];
    const aiService = {
      generateScenarioTextForExternalBilling: async (input: {
        variables: { languagePolicy: string };
      }) => {
        totalAiCalls += 1;
        correctionPolicies.push(input.variables.languagePolicy);
        const leakedValue = totalAiCalls === 1 ? testCase.value : undefined;

        return {
          taskId: `task-${testCase.section.toLowerCase()}-${totalAiCalls}`,
          providerName: "test-provider",
          modelName: "test-model",
          text: JSON.stringify({
            title: "论语选段",
            contentType: "GENERAL",
            summary: testCase.section === "SUMMARY" && leakedValue
              ? leakedValue
              : "我们来认识颜回身上值得珍视的品质。",
            closing: testCase.section === "CLOSING" && leakedValue
              ? leakedValue
              : "理解了这份赞美，再试着把原句完整背下来。",
            sentences: [{
              segmentId: "s1",
              script: testCase.section === "SCRIPT" && leakedValue
                ? leakedValue
                : "这里的“贤哉”，就是多么贤德啊，句子是在赞美颜回。",
              points: [{ term: "贤哉", meaning: "多么贤德啊", note: "赞叹语气" }]
            }]
          })
        };
      }
    };
    const service = new EnglishGuidedStudyService(
      {} as never,
      aiService as never,
      courseReviewService as never
    );
    const generateMaterialContent = (
      service as unknown as {
        generateMaterialContent: (input: Record<string, unknown>) => Promise<unknown>;
      }
    ).generateMaterialContent.bind(service);

    await generateMaterialContent({
      userId: "user-1",
      inputLabel: "古诗文纠偏内部措辞清理测试",
      maxTokens: 4_000,
      aiLevel: "G7",
      explanationMode: "SENTENCE",
      levelOptionLabel: "七年级",
      levelStandardName: "学段年级",
      levelProfile: "符合七年级理解能力。",
      scene: "GUSHIWEN",
      sourceSegments: [{ id: "s1", text: "贤哉，回也！" }],
      sourceName: null,
      sourceText: "贤哉，回也！",
      sourceType: "TEXT",
      title: "论语选段",
      referenceMaterials: []
    });

    assert.equal(totalAiCalls, 2, `${testCase.section}: ${testCase.value}`);
    assert.match(correctionPolicies[1] ?? "", /"issueType":"FEEDBACK_METADATA_LEAK"/);
    assert.match(correctionPolicies[1] ?? "", new RegExp(`"section":"${testCase.section}"`));
  }
});

test("古诗文关键词作为高亮增强项不会阻断完整口语文稿", async () => {
  let totalAiCalls = 0;
  const aiService = {
    generateScenarioTextForExternalBilling: async () => {
      totalAiCalls += 1;

      return {
        taskId: `task-${totalAiCalls}`,
        providerName: "test-provider",
        modelName: "test-model",
        text: JSON.stringify({
          title: "论语选段",
          contentType: "GENERAL",
          summary: "我们来体会孔子所说的学习境界。",
          closing: "理解以后，再试着把两句原文连起来背诵。",
          sentences: [
            {
              segmentId: "s1",
              script: "孔子再次感叹，颜回的品德真是高尚啊。",
              points: []
            },
            {
              segmentId: "s2",
              script: "这里的“乐之者”，就是把学习当作快乐的人，这是孔子认为的最高学习境界。",
              points: [
                { term: "无关词", meaning: "模型误加但没有讲解的词" },
                { term: "乐之者", meaning: "以学习为快乐的人" }
              ]
            }
          ]
        })
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    aiService as never,
    courseReviewService as never
  );
  const generateMaterialContent = (
    service as unknown as {
      generateMaterialContent: (input: Record<string, unknown>) => Promise<{
        sentences: Array<{ points: Array<{ term: string }> }>;
      }>;
    }
  ).generateMaterialContent.bind(service);

  const content = await generateMaterialContent({
    userId: "user-1",
    inputLabel: "古诗文关键词增强项测试",
    maxTokens: 4_000,
    aiLevel: "G7",
    explanationMode: "SENTENCE",
    levelOptionLabel: "七年级",
    levelStandardName: "学段年级",
    levelProfile: "符合七年级理解能力。",
    scene: "GUSHIWEN",
    sourceSegments: [
      { id: "s1", text: "贤哉，回也！" },
      { id: "s2", text: "知之者不如好之者，好之者不如乐之者。" }
    ],
    sourceName: null,
    sourceText: "贤哉，回也！知之者不如好之者，好之者不如乐之者。",
    sourceType: "TEXT",
    title: "论语选段",
    referenceMaterials: []
  });

  assert.equal(totalAiCalls, 1);
  assert.deepEqual(content.sentences.map((sentence) =>
    sentence.points.map((point) => point.term)
  ), [[], ["乐之者"]]);
});

test("英文带学后台任务默认在数分钟内恢复而不是等待十五分钟", () => {
  const previousStale = process.env.ENGLISH_GUIDED_STUDY_RECOVERY_STALE_MS;
  const previousSweep = process.env.ENGLISH_GUIDED_STUDY_RECOVERY_SWEEP_MS;
  delete process.env.ENGLISH_GUIDED_STUDY_RECOVERY_STALE_MS;
  delete process.env.ENGLISH_GUIDED_STUDY_RECOVERY_SWEEP_MS;

  try {
    assert.equal(englishGuidedStudyRecoveryStaleMs(), 150_000);
    assert.equal(englishGuidedStudyRecoverySweepMs(), 30_000);
  } finally {
    if (previousStale === undefined) {
      delete process.env.ENGLISH_GUIDED_STUDY_RECOVERY_STALE_MS;
    } else {
      process.env.ENGLISH_GUIDED_STUDY_RECOVERY_STALE_MS = previousStale;
    }
    if (previousSweep === undefined) {
      delete process.env.ENGLISH_GUIDED_STUDY_RECOVERY_SWEEP_MS;
    } else {
      process.env.ENGLISH_GUIDED_STUDY_RECOVERY_SWEEP_MS = previousSweep;
    }
  }
});
