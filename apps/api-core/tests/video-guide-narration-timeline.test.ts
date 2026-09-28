import { membershipWalletFixture } from "./helpers/membership-wallet-fixture.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNarrationIntroDraft,
  buildNarrationSentenceDrafts,
  buildNarrationSummaryDraft,
  buildNarrationTimelineDraft,
  buildPartialNarrationTimelineDraft,
  extractGuideWordsFromNarrationTimeline,
  extractSubtitleCues,
  VideoGuideService
} from "../src/video-guide/video-guide.service.js";

const cues = [
  {
    text: "The yogurt is thick enough.",
    timeRange: "00:00 - 00:03",
    startSeconds: 0,
    endSeconds: 3
  },
  {
    text: "It is ready to go into pots.",
    timeRange: "00:03 - 00:06",
    startSeconds: 3,
    endSeconds: 6
  }
];

function billingService() {
  process.env.DATABASE_URL ??=
    "postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public";
  const service = new VideoGuideService(
    {} as never,
    {} as never,
    { recordMaterialChange: async () => undefined } as never
  );

  Object.defineProperty(service, "prisma", {
    value: {
      ...membershipWalletFixture(),
      wallet: {
        upsert: async () => ({
          availableCredits: 100
        })
      }
    }
  });

  return service;
}

function lessonBillingInput(
  subtitleFormat: "SRT" | "ASS",
  subtitleText: string
) {
  return {
    mediaName: "billing-test.mp4",
    mediaType: "VIDEO" as const,
    mediaMimeType: "video/mp4",
    mediaSizeBytes: 1024,
    mediaUrl: "https://cdn.xueleai.com/billing-test.mp4",
    mediaStorageKey: "video-guide/billing-test.mp4",
    subtitleName: `billing-test.${subtitleFormat.toLowerCase()}`,
    subtitleFormat,
    subtitleSizeBytes: Buffer.byteLength(subtitleText),
    subtitleText
  };
}

test("视频导学导入模式只要求 intro 节点", () => {
  const node = buildNarrationIntroDraft(
    JSON.stringify({
      intro: {
        script: "今天我们先观察酸奶什么时候达到可以装罐的状态。"
      }
    }),
    "Yoghurt"
  );

  assert.equal(node.id, "intro");
  assert.equal(node.type, "INTRO");
  assert.match(node.script, /什么时候达到可以装罐/);
});

test("视频导学逐句模式不要求重复导入总结但必须覆盖目标句子", () => {
  const aiText = JSON.stringify({
    sentences: [
      {
        sentenceId: "s_001",
        teacherChunks: [
          {
            type: "context",
            text: "这里是在判断酸奶的浓稠度是否达到要求。"
          }
        ]
      },
      {
        sentenceId: "s_002",
        teacherChunks: [
          {
            type: "translation",
            text: "达到要求以后，它就可以被装进小罐里。"
          }
        ]
      }
    ]
  });
  const nodes = buildNarrationSentenceDrafts(aiText, cues, "Yoghurt");

  assert.deepEqual(nodes.map((node) => node.id), ["s_001", "s_002"]);
  assert.equal(nodes.every((node) => node.type === "SENTENCE"), true);
  assert.throws(
    () =>
      buildNarrationSentenceDrafts(
        JSON.stringify({
          sentences: [
            {
              sentenceId: "s_001",
              script: "这里只返回了第一句。"
            }
          ]
        }),
        cues,
        "Yoghurt"
      ),
    /AI 串讲结果未覆盖 s_002/
  );
});

test("视频导学逐句模式即使目标为空也拒绝缺失 sentences 的响应", () => {
  assert.throws(
    () => buildNarrationSentenceDrafts("{}", [], "Yoghurt"),
    /AI 串讲结果缺少逐句讲解/
  );
  assert.throws(
    () => buildNarrationSentenceDrafts('{"sentences":{}}', [], "Yoghurt"),
    /AI 串讲结果缺少逐句讲解/
  );
});

test("视频导学总结模式只要求 summary 节点", () => {
  const node = buildNarrationSummaryDraft(
    JSON.stringify({
      summary: {
        script: "今天我们抓住了 thick enough 和 go into pots 两个表达。"
      }
    }),
    "Yoghurt"
  );

  assert.equal(node.id, "summary");
  assert.equal(node.type, "SUMMARY");
  assert.match(node.script, /thick enough/);
});

test("视频导学完整解析器继续支持无目标句子时的导入总结", () => {
  const nodes = buildNarrationTimelineDraft(
    JSON.stringify({
      intro: {
        script: "今天先了解视频主题。"
      },
      summary: {
        script: "这段视频暂时没有需要逐句讲解的字幕。"
      }
    }),
    [],
    "Yoghurt"
  );

  assert.deepEqual(nodes.map((node) => node.id), ["intro", "summary"]);
});

test("视频导学串讲解析器把新版 teacherChunks 写入 narrationTimeline", () => {
  const aiText = JSON.stringify({
    intro: {
      script: "今天我们先看酸奶生产线，重点听 thick enough 和 go into pots。"
    },
    sentences: [
      {
        sentenceId: "s_001",
        teacherChunks: [
          {
            type: "context",
            text: "这里不是介绍新材料，而是在判断酸奶的状态是否达到了下一步条件。",
            overlay: null
          },
          {
            type: "phrase",
            text: "thick enough 表示厚度已经足够，enough 放在形容词后面，这是很常见的结构。",
            overlay: {
              text: "thick enough",
              subText: "厚度足够"
            }
          },
          {
            type: "translation",
            text: "合起来就是：如果酸奶足够浓稠，就可以进入下一步了。",
            overlay: null
          }
        ]
      },
      {
        sentenceId: "s_002",
        teacherChunks: [
          {
            type: "context",
            text: "这句话承接上一句的条件，说明酸奶已经可以装进小罐里。",
            overlay: null
          },
          {
            type: "translation",
            text: "按英文顺序理解，就是：它已经准备好进入罐子里了。",
            overlay: null
          }
        ]
      }
    ],
    summary: {
      script: "这两句帮助我们抓住从状态判断到动作推进的关系。"
    }
  });

  const nodes = buildNarrationTimelineDraft(aiText, cues, "Yoghurt");
  const firstSentence = nodes.find((node) => node.id === "s_001");

  assert.equal(nodes[0]?.id, "intro");
  assert.equal(nodes.at(-1)?.id, "summary");
  assert.ok(firstSentence);
  assert.match(firstSentence.script, /thick enough 表示厚度已经足够/);
  assert.match(firstSentence.script, /合起来就是/);
  assert.doesNotMatch(firstSentence.script, /这一句先帮你抓画面和语言的对应关系/);
  assert.equal(firstSentence.chunks[1]?.overlay?.text, "thick enough");
  assert.equal(firstSentence.chunks[2]?.type, "translation");
});

test("词语巩固完整保留互动讲解设计的全部词语且忽略普通讲解猜词", () => {
  const phrases = [
    "put out the fire",
    "all the way up to the top",
    "training exercises",
    "pull out a ladder",
    "a giant hose",
    "come out of the end",
    "be powerful enough",
    "reach the fire tower",
    "reflective strips",
    "keep firefighters visible",
    "in thick smoke",
    "protective clothing",
    "emergency equipment",
    "respond to a call",
    "work as a team"
  ];
  const timeline = phrases.map((phrase, index) => ({
    id: `s_${String(index + 1).padStart(3, "0")}`,
    type: "SENTENCE" as const,
    title: `第 ${index + 1} 句`,
    script: `${phrase} 是本句值得掌握的表达。`,
    sentenceId: `s_${String(index + 1).padStart(3, "0")}`,
    subtitle: `The firefighters ${phrase}.`,
    timeRange: `00:${String(index).padStart(2, "0")} - 00:${String(index + 1).padStart(2, "0")}`,
    startSeconds: index,
    endSeconds: index + 1,
    chunks: [
      {
        id: `context-${index}`,
        type: "context",
        text: "这里先理解画面和上下文，ordinary fallback 不应生成词卡。",
        overlay: null
      },
      {
        id: `phrase-${index}`,
        type: "phrase",
        text: `${phrase} 是本句的重点表达。`,
        overlay: {
          text: phrase,
          subText: `表达 ${index + 1}`
        }
      }
    ]
  }));

  const words = extractGuideWordsFromNarrationTimeline(timeline);

  assert.equal(words.length, phrases.length);
  assert.deepEqual(words.map((word) => word.word), phrases);
  assert.equal(words.some((word) => word.word.includes("ordinary fallback")), false);
});

test("视频导学字幕解析保留空字幕块的时间轴", () => {
  const parsed = extractSubtitleCues(
    "SRT",
    [
      "1",
      "00:00:00,000 --> 00:00:03,000",
      "The yogurt is thick enough.",
      "",
      "2",
      "00:00:03,000 --> 00:00:06,000",
      "",
      "3",
      "00:00:06,000 --> 00:00:09,000",
      "It is ready to go into pots."
    ].join("\n")
  );

  assert.equal(parsed.length, 3);
  assert.equal(parsed[1]?.text, "");
  assert.equal(parsed[1]?.timeRange, "00:03 - 00:06");
  assert.equal(parsed[2]?.text, "It is ready to go into pots.");
});

test("视频导学文案按 SRT 有效非空字幕每句一点预估", async () => {
  const subtitleText = [
    "1",
    "00:00:00,000 --> 00:00:03,000",
    "The yogurt is thick enough.",
    "",
    "2",
    "00:00:03,000 --> 00:00:06,000",
    "",
    "3",
    "00:00:06,000 --> 00:00:09,000",
    "It is ready to go into pots."
  ].join("\n");
  const estimate = await billingService().estimateLessonGeneration(
    "billing-user",
    lessonBillingInput("SRT", subtitleText)
  );

  assert.equal(estimate.estimatedCredits, 2);
  assert.equal(estimate.items[0]?.estimatedCredits, 2);
  assert.doesNotMatch(estimate.items[0]?.description ?? "", /按句|每句/);
});

test("视频导学文案按 ASS 有效 Dialogue 字幕数量预估", async () => {
  const subtitleText = [
    "[Script Info]",
    "Title: Billing test",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    "Dialogue: 0,0:00:00.00,0:00:03.00,Default,,0,0,0,,The yogurt is thick enough.",
    "Dialogue: 0,0:00:03.00,0:00:06.00,Default,,0,0,0,,",
    "Dialogue: 0,0:00:06.00,0:00:09.00,Default,,0,0,0,,It is ready to go into pots."
  ].join("\n");
  const estimate = await billingService().estimateLessonGeneration(
    "billing-user",
    lessonBillingInput("ASS", subtitleText)
  );

  assert.equal(estimate.estimatedCredits, 2);
});

test("视频导学串讲解析器跳过空字幕句并保留后续原始句号", () => {
  const editedCues = [
    {
      ...cues[0],
      sentenceId: "s_001"
    },
    {
      text: "",
      timeRange: "00:03 - 00:06",
      startSeconds: 3,
      endSeconds: 6,
      sentenceId: "s_002"
    },
    {
      ...cues[1],
      sentenceId: "s_003",
      timeRange: "00:06 - 00:09",
      startSeconds: 6,
      endSeconds: 9
    }
  ];
  const aiText = JSON.stringify({
    intro: {
      script: "今天继续看酸奶生产线。"
    },
    sentences: [
      {
        sentenceId: "s_001",
        teacherChunks: [
          {
            type: "context",
            text: "第一句说明酸奶的浓稠度。"
          }
        ]
      },
      {
        sentenceId: "s_003",
        teacherChunks: [
          {
            type: "context",
            text: "这里直接跳过被删掉的空句，继续讲装罐动作。"
          }
        ]
      }
    ],
    summary: {
      script: "这两句仍然可以形成完整学习线索。"
    }
  });

  const nodes = buildNarrationTimelineDraft(aiText, editedCues, "Yoghurt");

  assert.ok(nodes.some((node) => node.id === "s_001"));
  assert.equal(nodes.some((node) => node.id === "s_002"), false);
  assert.equal(nodes.find((node) => node.id === "s_003")?.startSeconds, 6);
  assert.match(nodes.find((node) => node.id === "s_003")?.script ?? "", /继续讲装罐动作/);
});

test("视频导学串讲解析器遇到截断 JSON 时不能静默生成旧模板", () => {
  assert.throws(
    () =>
      buildNarrationTimelineDraft(
        '{"intro":{"script":"今天我们看酸奶。"},"sentences":[{"sentenceId":"s_001","teacherChunks":[{"type":"context","text":"这里讲状态。"}]',
        cues,
        "Yoghurt"
      ),
    /AI 串讲结果解析失败/
  );
});

test("视频导学串讲解析器支持补生成时保留原始 sentenceId", () => {
  const chunkCues = [
    {
      ...cues[0],
      sentenceId: "s_005"
    },
    {
      ...cues[1],
      sentenceId: "s_006"
    }
  ];
  const aiText = JSON.stringify({
    intro: {
      script: "这一小段继续看酸奶生产线。"
    },
    sentences: [
      {
        sentenceId: "s_005",
        teacherChunks: [
          {
            type: "context",
            text: "这里承接前面的观察，说明酸奶状态已经达到下一步要求。"
          },
          {
            type: "translation",
            text: "合起来就是：酸奶已经足够浓稠了。"
          }
        ]
      },
      {
        sentenceId: "s_006",
        teacherChunks: [
          {
            type: "context",
            text: "这一句把状态判断推进到实际动作，也就是装罐。"
          },
          {
            type: "translation",
            text: "按英文顺序理解，就是：它已经可以进入罐子里了。"
          }
        ]
      }
    ],
    summary: {
      script: "这两句完成了从状态到动作的推进。"
    }
  });

  const nodes = buildNarrationTimelineDraft(aiText, chunkCues, "Yoghurt");

  assert.ok(nodes.some((node) => node.id === "s_005"));
  assert.ok(nodes.some((node) => node.id === "s_006"));
  assert.equal(nodes.find((node) => node.id === "s_005")?.chunks[1]?.type, "translation");
});

test("视频导学串讲部分解析器保留已生成句子用于补缺", () => {
  const aiText = JSON.stringify({
    intro: {
      script: "今天先看酸奶。"
    },
    sentences: [
      {
        sentenceId: "s_001",
        teacherChunks: [
          {
            type: "context",
            text: "这一句先说明酸奶的状态。"
          }
        ]
      }
    ],
    summary: {
      script: "这一小段先到这里。"
    }
  });

  const nodes = buildPartialNarrationTimelineDraft(aiText, cues, "Yoghurt");

  assert.equal(nodes[0]?.id, "intro");
  assert.equal(nodes.at(-1)?.id, "summary");
  assert.ok(nodes.some((node) => node.id === "s_001"));
  assert.equal(nodes.some((node) => node.id === "s_002"), false);
});

test("视频导学串讲解析器兼容句子只有 script 的模型返回", () => {
  const aiText = JSON.stringify({
    intro: {
      script: "今天继续看酸奶装罐。"
    },
    sentences: [
      {
        sentenceId: "s_001",
        teacherChunks: [
          {
            type: "context",
            text: "这一句说明酸奶的状态。"
          }
        ]
      },
      {
        sentenceId: "s_002",
        script: "这一句把状态判断推进到装罐动作。按英文顺序理解，就是：它已经可以进入罐子里了。"
      }
    ],
    summary: {
      script: "这两句讲清楚了从状态到动作的关系。"
    }
  });

  const nodes = buildNarrationTimelineDraft(aiText, cues, "Yoghurt");
  const secondSentence = nodes.find((node) => node.id === "s_002");

  assert.ok(secondSentence);
  assert.match(secondSentence.script, /装罐动作/);
  assert.equal(secondSentence.chunks[0]?.type, "meaning");
});

test("视频导学串讲解析器修复模型在讲解文本里未转义的英文引号", () => {
  const aiText = `
{
  "intro": {
    "script": "今天先听一个表达 "find yourself doing something"，它表示不自觉地做某事。"
  },
  "sentences": [
    {
      "sentenceId": "s_001",
      "teacherChunks": [
        {
          "type": "context",
          "text": "这里的 "thick enough" 表示已经足够浓稠，enough 放在形容词后面。",
          "overlay": {
            "text": "thick enough",
            "subText": "足够浓稠"
          }
        }
      ]
    },
    {
      "sentenceId": "s_002",
      "teacherChunks": [
        {
          "type": "translation",
          "text": "最后记住 "go into pots" 这个动作，就是进入罐子里。"
        }
      ]
    }
  ],
  "summary": {
    "script": "这节课记住 "find yourself" 和 "go into pots"。"
  }
}
`;

  const nodes = buildNarrationTimelineDraft(aiText, cues, "Yoghurt");
  const introNode = nodes.find((node) => node.id === "intro");
  const firstSentence = nodes.find((node) => node.id === "s_001");
  const secondSentence = nodes.find((node) => node.id === "s_002");
  const summaryNode = nodes.find((node) => node.id === "summary");

  assert.match(introNode?.script ?? "", /find yourself doing something/);
  assert.match(firstSentence?.script ?? "", /thick enough/);
  assert.equal(firstSentence?.chunks[0]?.overlay?.text, "thick enough");
  assert.match(secondSentence?.script ?? "", /go into pots/);
  assert.match(summaryNode?.script ?? "", /find yourself/);
});

test("视频导学串讲解析器修复讲解文本中引号后紧跟逗号的英文表达", () => {
  const aiText = `
{
  "intro": {
    "script": "今天先看一个节目推荐，注意 "the first one is" 这个列举结构。"
  },
  "sentences": [
    {
      "sentenceId": "s_001",
      "teacherChunks": [
        {
          "type": "phrase",
          "text": "注意这个表达 "The first one is..."，在列举时非常常用；比如推荐电影时，可以说 "The first one is...", 然后再说下一个。",
          "overlay": {
            "text": "the first one is",
            "subText": "第一个是"
          }
        }
      ]
    },
    {
      "sentenceId": "s_002",
      "teacherChunks": [
        {
          "type": "translation",
          "text": "这里的 "made by Netflix", 表示由 Netflix 制作。"
        }
      ]
    }
  ],
  "summary": {
    "script": "这节课先记住 "The first one is...", 再注意 made by。"
  }
}
`;

  const nodes = buildNarrationTimelineDraft(aiText, cues, "Explained");
  const firstSentence = nodes.find((node) => node.id === "s_001");
  const secondSentence = nodes.find((node) => node.id === "s_002");

  assert.match(firstSentence?.script ?? "", /然后再说下一个/);
  assert.equal(firstSentence?.chunks[0]?.overlay?.text, "the first one is");
  assert.match(secondSentence?.script ?? "", /Netflix 制作/);
});
