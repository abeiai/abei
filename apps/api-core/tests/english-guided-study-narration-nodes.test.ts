import assert from "node:assert/strict";
import test from "node:test";

import {
  alignEnglishNarrationPointsToScript,
  buildEnglishNarrationNodeDrafts,
  englishNarrationPointsFollowScript,
  parseEnglishNarrationNodeDrafts
} from "../src/english-guided-study/english-guided-study-narration-nodes.js";
import * as narrationNodes from "../src/english-guided-study/english-guided-study-narration-nodes.js";

const sentences = [
  {
    id: "s1",
    text: "A smile shows that a person is happy.",
    points: [{ id: "p1-1", term: "shows" }]
  },
  {
    id: "s2",
    text: "People smile for many reasons.",
    points: [{ id: "p2-1", term: "many reasons" }]
  }
];

test("节点文稿解析器按导入、逐句教学块和总结生成播放节点", () => {
  const nodes = parseEnglishNarrationNodeDrafts(
    JSON.stringify({
      intro: { script: "今天学习微笑的力量。" },
      sentences: [
        {
          sentenceId: "s1",
          chunks: [
            { type: "CONTEXT", script: "第一句说明微笑表达快乐。", focusPointId: null },
            { type: "WORD", script: "shows 在这里表示体现。", focusPointId: "p1-1" }
          ]
        },
        {
          sentenceId: "s2",
          chunks: [{ type: "PHRASE", script: "many reasons 表示很多原因。", focusPointId: "p2-1" }]
        }
      ],
      summary: { script: "现在回顾全文。" }
    }),
    sentences
  );

  assert.deepEqual(nodes.map((node) => node.id), ["intro", "s1-c1", "s1-c2", "s2-c1", "summary"]);
  assert.equal(nodes[0]?.sentenceId, null);
  assert.deepEqual(nodes[2]?.focus, { pointId: "p1-1", text: "shows" });
  assert.equal(nodes[4]?.type, "SUMMARY");
});

test("节点文稿缺少任何原文句子时拒绝生成音频", () => {
  assert.throws(
    () => parseEnglishNarrationNodeDrafts(
      JSON.stringify({
        intro: { script: "导入。" },
        sentences: [{ sentenceId: "s1", chunks: [{ type: "CONTEXT", script: "讲解。", focusPointId: null }] }],
        summary: { script: "总结。" }
      }),
      sentences
    ),
    /未完整覆盖全文句子/
  );
});

test("节点文稿引用不属于当前句子的词语点时拒绝生成音频", () => {
  assert.throws(
    () => parseEnglishNarrationNodeDrafts(
      JSON.stringify({
        intro: { script: "导入。" },
        sentences: [
          { sentenceId: "s1", chunks: [{ type: "WORD", script: "错误引用。", focusPointId: "p2-1" }] },
          { sentenceId: "s2", chunks: [{ type: "CONTEXT", script: "讲解。", focusPointId: null }] }
        ],
        summary: { script: "总结。" }
      }),
      sentences
    ),
    /引用了不属于当前句子的词语点/
  );
});

test("语音节点只拆分已确认文稿并保留导语与结束语", () => {
  const confirmedSentences = [
    {
      ...sentences[0],
      script: "先理解整句。shows 在这里表示“体现”。再联系自己的生活造句。"
    },
    {
      ...sentences[1],
      script: "Now notice many reasons. 这里强调原因不止一个。"
    }
  ];
  const nodes = buildEnglishNarrationNodeDrafts(
    "这是一篇讲微笑的短文。",
    confirmedSentences,
    "回头看，我们理解了微笑的作用，也学习了 shows 和 many reasons 的表达。"
  );

  assert.equal(nodes[0]?.script, "这是一篇讲微笑的短文。");
  assert.equal(nodes.at(-1)?.type, "SUMMARY");
  assert.match(nodes.at(-1)?.script ?? "", /shows.*many reasons/);

  for (const sentence of confirmedSentences) {
    const synthesizedText = nodes
      .filter((node) => node.sentenceId === sentence.id)
      .map((node) => node.script)
      .join("");

    assert.equal(synthesizedText, sentence.script);
  }
});

test("古诗文同一片段的多个关键词按讲解顺序生成独立高亮节点", () => {
  const script =
    "我们先读一遍，孤帆远影碧空尽。再读懂眼前的画面：‘孤帆’不是许多船，而是远处那一叶孤单的帆船；‘远影’写船越走越远，只剩模糊的影子。最后的‘碧空尽’，是说帆影仿佛消失在碧蓝天空的尽头。";
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们跟着诗人的目光送别朋友。",
    [
      {
        id: "s1",
        text: "孤帆远影碧空尽",
        script,
        points: [
          { id: "p1-1", term: "孤帆" },
          { id: "p1-2", term: "远影" },
          { id: "p1-3", term: "碧空尽" }
        ]
      }
    ],
    "现在试着顺着孤帆、远影、碧空尽这条画面线索背诵。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");

  assert.deepEqual(
    sentenceNodes.flatMap((node) => node.focus?.pointId ? [node.focus.pointId] : []),
    ["p1-1", "p1-2", "p1-3"]
  );
  assert.equal(sentenceNodes.map((node) => node.script).join(""), script);
  assert.match(sentenceNodes.find((node) => node.focus?.pointId === "p1-1")?.script ?? "", /不是许多船/);
});

test("古诗文先朗读原句再自然讲解时从实际讲解处开始切换关键词", () => {
  const script =
    "先慢慢读一遍：孤帆远影碧空尽。这里的孤帆，是江面上一叶孤单的帆船。接着看远影，它让我们看到船已经越走越远。再看碧空尽，帆影仿佛消失在碧蓝天空的尽头。";
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们跟着诗人的目光送别朋友。",
    [
      {
        id: "s1",
        text: "孤帆远影碧空尽。",
        script,
        points: [
          { id: "p1-1", term: "孤帆" },
          { id: "p1-2", term: "远影" },
          { id: "p1-3", term: "碧空尽" }
        ]
      }
    ],
    "现在试着背诵这一句。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");

  assert.equal(sentenceNodes.map((node) => node.script).join(""), script);
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-1")?.script ?? "",
    /^这里的孤帆/u
  );
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-2")?.script ?? "",
    /^接着看远影/u
  );
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-3")?.script ?? "",
    /^再看碧空尽/u
  );
});

test("古诗文讲解中引用原文分句时不会被误判为再次朗读", () => {
  const sourceText = "子曰：“学而时习之，不亦说乎？";
  const script =
    "首先看第一句，“子曰：‘学而时习之，不亦说乎？’”这里的“子”是古代对男子的尊称，在《论语》里通常特指孔子。“学而时习之”中的“时”是按时、时常的意思，“习”还有实习、演练的含义。后半句“不亦说乎”是个反问句，“说”字在这里通“悦”，意思是愉快、高兴。";
  const points = [
    { id: "p1-1", term: "子" },
    { id: "p1-2", term: "时习" },
    { id: "p1-3", term: "说" }
  ];
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们来读《论语》。",
    [{ id: "s1", text: sourceText, script, points }],
    "现在回想这句话。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");

  assert.equal(englishNarrationPointsFollowScript(script, points, sourceText), true);
  assert.equal(sentenceNodes.map((node) => node.script).join(""), script);
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-1")?.script ?? "",
    /^这里的“子”/u
  );
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-2")?.script ?? "",
    /^“学而时习之”中的/u
  );
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-3")?.script ?? "",
    /^“说”字在这里/u
  );
});

test("古诗文组合词拆开讲解时仍按实际讲解位置切换关键词", () => {
  const sourceText = "子曰：“学而时习之，不亦说乎？";
  const script =
    "子曰：‘学而时习之，不亦说乎？’这里的‘子’是古代对男子的尊称，特指孔子。‘学’是指学习知识或技能。关键在于这个‘时’字，它意思是按时，或者说是适时。‘习’不仅仅是复习，更包含实习、实践的意思。所以这句话是说，学习了知识然后按时去温习、去实践，这难道不是一件很愉快的事情吗？注意这个‘说’字，它通‘悦’，读音是yuè，意思是愉快、高兴。孔子认为，学习后的实践和巩固能带来内心的满足感。";
  const points = [
    { id: "p1-1", term: "子" },
    { id: "p1-2", term: "时习" },
    { id: "p1-3", term: "说" }
  ];
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们来读《论语》。",
    [{ id: "s1", text: sourceText, script, points }],
    "现在回想这句话。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");

  assert.equal(englishNarrationPointsFollowScript(script, points, sourceText), true);
  assert.deepEqual(
    sentenceNodes.flatMap((node) => node.focus?.pointId ? [node.focus.pointId] : []),
    ["p1-1", "p1-2", "p1-3"]
  );
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-2")?.script ?? "",
    /^关键在于这个‘时’字/u
  );
});

test("古诗文组合词只讲解部分字时仍判定为未完整覆盖", () => {
  const sourceText = "学而时习之。";
  const script = "先读一遍：学而时习之。这里的‘时’，是按时的意思。";
  const points = [{ id: "p1-1", term: "时习" }];

  assert.equal(englishNarrationPointsFollowScript(script, points, sourceText), false);
});

test("古诗文组合词中的字只偶然出现在普通讲解中时仍判定为未完整覆盖", () => {
  const sourceText = "学而时习之，不亦说乎？";
  const script =
    "先读一遍：学而时习之，不亦说乎？学习这句话时，要注意反问语气，它的意思是学习会带来快乐。";
  const points = [{ id: "p1-1", term: "时习" }];

  assert.equal(englishNarrationPointsFollowScript(script, points, sourceText), false);
});

test("古诗文组合词不会把锚点前普通用语中的单字拼成释义", () => {
  const sourceText = "学而时习之。";
  const script = "先读原句：学而时习之。有时这个“习”是指习惯，并不是在讲按时温习。";
  const points = [{ id: "p1-1", term: "时习" }];

  assert.equal(englishNarrationPointsFollowScript(script, points, sourceText), false);
});

test("古诗文组合词逐字释义时识别每个字的独立教学锚点", () => {
  const sourceText = "学而时习之。";
  const points = [{ id: "p1-1", term: "时习" }];

  assert.equal(
    englishNarrationPointsFollowScript(
      "先读一遍：学而时习之。这里的“时”是按时，“习”是温习和实践。",
      points,
      sourceText
    ),
    true
  );
  assert.equal(
    englishNarrationPointsFollowScript(
      "先读一遍：学而时习之。“时”的含义是按时；“习”的含义是温习和实践。",
      points,
      sourceText
    ),
    true
  );
  assert.equal(
    englishNarrationPointsFollowScript(
      "先读一遍：学而时习之。“时”是按时，“习”不仅是复习，还有实践的意思。",
      points,
      sourceText
    ),
    true
  );
  assert.equal(
    englishNarrationPointsFollowScript(
      "先读一遍：学而时习之。“时”在这里解释为按时，“习”不仅仅是复习，更包含实践的意思。",
      points,
      sourceText
    ),
    true
  );
});

test("古诗文组合词以紧邻短语解释前缀字时识别完整释义", () => {
  const sourceText = "四十而不惑。";
  const script = "先读原句：四十而不惑。孔子到了四十岁时，不再感到‘惑’，也就是没有疑惑。";
  const points = [{ id: "p1-1", term: "不惑" }];

  assert.equal(englishNarrationPointsFollowScript(script, points, sourceText), true);
  assert.equal(
    englishNarrationPointsFollowScript(
      "先读原句：四十而不惑。四十岁时，遇到事情不再感到迷惑。",
      points,
      sourceText
    ),
    true
  );
});

test("古诗文关键词数组与口语讲解顺序不同时按实际讲解顺序重排", () => {
  const orderPoints = Reflect.get(narrationNodes, "orderEnglishNarrationPointsByScript");
  const sourceText = "贤哉，回也！”";
  const script =
    "接着看孔子对颜回的评价。他说，贤哉，回也！这句话是倒装句，正常语序应该是“回也，贤哉”，意思是颜回的品质真是高尚啊。这里把“贤哉”提前，是为了加强赞叹的语气。";
  const points = [
    { id: "p1-1", term: "贤" },
    { id: "p1-2", term: "回" }
  ];

  assert.equal(typeof orderPoints, "function");
  const ordered = orderPoints(script, points, sourceText);
  assert.deepEqual(ordered?.map((point: { id: string }) => point.id), ["p1-2", "p1-1"]);
  assert.equal(englishNarrationPointsFollowScript(script, ordered, sourceText), true);
});

test("古诗文倒装句用正常语序整体释义时按正常语序切换关键词", () => {
  const orderPoints = Reflect.get(narrationNodes, "orderEnglishNarrationPointsByScript");
  const sourceText = "贤哉，回也！”";
  const script =
    "孔子接着赞叹道：贤哉，回也！这句话是倒装句，正常语序应该是“回也，贤哉”，意思是颜回的品质真是高尚啊。";
  const points = [
    { id: "p1", term: "贤" },
    { id: "p2", term: "回" }
  ];

  const ordered = orderPoints(script, points, sourceText);
  assert.deepEqual(ordered?.map((point: { term: string }) => point.term), ["回", "贤"]);
});

test("古诗文长关键词采用自然同义释义时仍判定为完整覆盖", () => {
  const orderPoints = Reflect.get(narrationNodes, "orderEnglishNarrationPointsByScript");
  const sourceText = "七十而从心所欲，不逾矩。";
  const script = "到了七十岁，可以顺从自己的意愿做事，但不会越过法度和规矩。";
  const points = [{
    id: "p1",
    term: "从心所欲，不逾矩",
    meaning: "顺从意愿，不越过法度"
  }];

  assert.deepEqual(orderPoints(script, points, sourceText)?.map((point: { id: string }) => point.id), ["p1"]);
});

test("古诗文长关键词的概述不会抢在明确释义前切换关键词", () => {
  const orderPoints = Reflect.get(narrationNodes, "orderEnglishNarrationPointsByScript");
  const sourceText = "七十而从心所欲，不逾矩。";
  const script =
    "先概述学习目标：理解顺从意愿、不越过法度的境界。这里的“七十”指七十岁；接着解释“从心所欲，不逾矩”，就是顺着心意做事却不越过规矩。";
  const points = [
    { id: "p1", term: "从心所欲，不逾矩", meaning: "顺从意愿，不越过法度" },
    { id: "p2", term: "七十", meaning: "七十岁" }
  ];

  assert.deepEqual(
    orderPoints(script, points, sourceText)?.map((point: { term: string }) => point.term),
    ["七十", "从心所欲，不逾矩"]
  );
});

test("古诗文自然短语明确表示不讲某词时不算完整释义", () => {
  const sourceText = "四十而不惑。";
  const script = "先读原句：四十而不惑。这里不再讲惑，下面学习其他内容。";
  const points = [{ id: "p1", term: "不惑" }];

  assert.equal(englishNarrationPointsFollowScript(script, points, sourceText), false);
});

test("古诗文一字引语后的连续朗读仍从释义处切换", () => {
  const sourceText = "曰：“可矣。”";
  const script = "曰。可矣。这里表示可以了。";
  const points = [{ id: "p1", term: "可矣" }];
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们来读这一句。",
    [{ id: "s1", text: sourceText, script, points }],
    "现在回想这句话。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");
  const firstFocusIndex = sentenceNodes.findIndex((node) => node.focus?.pointId === "p1");

  assert.equal(englishNarrationPointsFollowScript(script, points, sourceText), true);
  assert.equal(
    sentenceNodes.slice(0, firstFocusIndex).map((node) => node.script).join(""),
    "曰。可矣。"
  );
  assert.match(sentenceNodes[firstFocusIndex]?.script ?? "", /^这里表示/u);
});

test("古诗文短原句有朗读提示时仍从释义处切换", () => {
  const sourceText = "可矣。";
  const script = "先读原句：可矣。这里表示可以了。";
  const points = [{ id: "p1", term: "可矣", meaning: "可以了" }];
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们来读这一句。",
    [{ id: "s1", text: sourceText, script, points }],
    "现在回想这句话。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");
  const firstFocusIndex = sentenceNodes.findIndex((node) => node.focus?.pointId === "p1");

  assert.equal(englishNarrationPointsFollowScript(script, points, sourceText), true);
  assert.equal(
    sentenceNodes.slice(0, firstFocusIndex).map((node) => node.script).join(""),
    "先读原句：可矣。"
  );
  assert.match(sentenceNodes[firstFocusIndex]?.script ?? "", /^这里表示/u);
});

test("古诗文单关键词后的普通指代语境不算释义", () => {
  const sourceText = "曰：“可矣。”";
  const script = "曰。可矣。这里是下一课的内容，本句暂不解释。";
  const points = [{ id: "p1", term: "可矣", meaning: "可以了" }];

  assert.equal(englishNarrationPointsFollowScript(script, points, sourceText), false);
});

test("古诗文不惑采用不再困惑的自然释义时判定为完整覆盖", () => {
  const sourceText = "四十而不惑。";
  const script = "先读原句：四十而不惑。到了四十岁，不再困惑。";
  const points = [{ id: "p1", term: "不惑", meaning: "不再困惑" }];

  assert.equal(englishNarrationPointsFollowScript(script, points, sourceText), true);
});

test("古诗文关键词 ID 重复时拒绝生成避免高亮命中错误释义", () => {
  const orderPoints = Reflect.get(narrationNodes, "orderEnglishNarrationPointsByScript");
  const sourceText = "贤哉，回也！”";
  const script =
    "接着看孔子对颜回的评价。他说，贤哉，回也！这句话是倒装句，正常语序应该是“回也，贤哉”，意思是颜回的品质真是高尚啊。这里把“贤哉”提前，是为了加强赞叹的语气。";
  const points = [
    { id: "dup", term: "贤" },
    { id: "dup", term: "回" }
  ];

  const ordered = orderPoints(script, points, sourceText);
  assert.equal(ordered, null);
});

test("古诗文概述中的普通用词不会抢在明确释义前切换关键词", () => {
  const orderPoints = Reflect.get(narrationNodes, "orderEnglishNarrationPointsByScript");
  const sourceText = "吾十有五而志于学，三十而立，五十而知天命，不逾矩。";
  const script =
    "我十五岁就立志于学习，到了三十岁能够立身于世。这里的“十有五”就是十五岁的意思。“立”是指立身，有所成就。“天命”指上天的意旨。“逾矩”的“逾”是越过的意思。";
  const points = ["十有五", "立", "天命", "逾矩"].map((term, index) => ({ id: `p${index}`, term }));

  const ordered = orderPoints(script, points, sourceText);
  assert.deepEqual(
    ordered?.map((point: { term: string }) => point.term),
    ["十有五", "立", "天命", "逾矩"]
  );
});

test("古诗文分段朗读且每段只有一个关键词时仍从释义处切换", () => {
  const script =
    "先读前半句：日月之行。再读后半句：若出其中。这里的日月，是太阳和月亮；再看其中，指沧海之中。";
  const points = [
    { id: "p1-1", term: "日月" },
    { id: "p1-2", term: "其中" }
  ];
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们来读曹操的诗。",
    [{ id: "s1", text: "日月之行，若出其中。", script, points }],
    "现在回想诗中的开阔气象。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");

  assert.equal(englishNarrationPointsFollowScript(script, points, "日月之行，若出其中。"), true);
  assert.equal(sentenceNodes.map((node) => node.script).join(""), script);
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-1")?.script ?? "",
    /^这里的日月/u
  );
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-2")?.script ?? "",
    /^再看其中/u
  );
});

test("古诗文开头连续分段朗读无提示词时仍从释义处切换", () => {
  const script =
    "日月之行。若出其中。这里的日月，是太阳和月亮；再看其中，指沧海之中。";
  const points = [
    { id: "p1-1", term: "日月" },
    { id: "p1-2", term: "其中" }
  ];
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们来读曹操的诗。",
    [{ id: "s1", text: "日月之行，若出其中。", script, points }],
    "现在回想诗中的开阔气象。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");

  assert.equal(englishNarrationPointsFollowScript(script, points, "日月之行，若出其中。"), true);
  assert.equal(sentenceNodes.map((node) => node.script).join(""), script);
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-1")?.script ?? "",
    /^这里的日月/u
  );
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-2")?.script ?? "",
    /^再看其中/u
  );
});

test("古诗文开头含两字短句的连续朗读仍从释义处切换", () => {
  const script = "岁寒。然后知松柏之后凋也。这里的岁寒，是天气寒冷；再看松柏，指松树和柏树。";
  const points = [
    { id: "p1-1", term: "岁寒" },
    { id: "p1-2", term: "松柏" }
  ];
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们来读这一句。",
    [{ id: "s1", text: "岁寒，然后知松柏之后凋也。", script, points }],
    "现在回想松柏。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");

  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-1")?.script ?? "",
    /^这里的岁寒/u
  );
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-2")?.script ?? "",
    /^再看松柏/u
  );
});

test("古诗文完整分句就是关键词时按朗读提示区分原句与释义", () => {
  const script =
    "先读前半句：夕阳西下。再读后半句：断肠人在天涯。这里的夕阳西下，是傍晚太阳落山的景象；再看断肠人，是漂泊思乡的人。";
  const points = [
    { id: "p1-1", term: "夕阳西下" },
    { id: "p1-2", term: "断肠人" }
  ];
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们来读马致远的小令。",
    [{ id: "s1", text: "夕阳西下，断肠人在天涯。", script, points }],
    "现在回想天涯游子的心情。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");

  assert.equal(
    englishNarrationPointsFollowScript(script, points, "夕阳西下，断肠人在天涯。"),
    true
  );
  assert.equal(sentenceNodes.map((node) => node.script).join(""), script);
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-1")?.script ?? "",
    /^这里的夕阳西下/u
  );
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-2")?.script ?? "",
    /^再看断肠人/u
  );
});

test("古诗文释义中的读懂和原句中不会被误判为朗读提示", () => {
  const script =
    "先读前半句：夕阳西下。再读后半句：断肠人在天涯。原句中的夕阳西下，是傍晚太阳落山的景象；原句中的断肠人，是漂泊思乡的人。";
  const points = [
    { id: "p1-1", term: "夕阳西下" },
    { id: "p1-2", term: "断肠人" }
  ];
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们来读马致远的小令。",
    [{ id: "s1", text: "夕阳西下，断肠人在天涯。", script, points }],
    "现在回想天涯游子的心情。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");

  assert.equal(
    englishNarrationPointsFollowScript(script, points, "夕阳西下，断肠人在天涯。"),
    true
  );
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-1")?.script ?? "",
    /^原句中的夕阳西下/u
  );
  assert.match(
    sentenceNodes.find((node) => node.focus?.pointId === "p1-2")?.script ?? "",
    /^原句中的断肠人/u
  );
});

test("古诗文朗读动作支持读一遍原句和读出前半句等组合补语", () => {
  const points = [
    { id: "p1-1", term: "夕阳西下" },
    { id: "p1-2", term: "断肠人" }
  ];

  for (const readingCue of ["先读一遍原句", "先朗读一下原句", "先读出前半句"]) {
    const script =
      `${readingCue}：夕阳西下。再读后半句：断肠人在天涯。这里的夕阳西下，是傍晚太阳落山的景象；再看断肠人，是漂泊思乡的人。`;
    const nodes = buildEnglishNarrationNodeDrafts(
      "我们来读马致远的小令。",
      [{ id: "s1", text: "夕阳西下，断肠人在天涯。", script, points }],
      "现在回想天涯游子的心情。"
    );
    const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");

    assert.equal(
      englishNarrationPointsFollowScript(script, points, "夕阳西下，断肠人在天涯。"),
      true
    );
    assert.match(
      sentenceNodes.find((node) => node.focus?.pointId === "p1-1")?.script ?? "",
      /^这里的夕阳西下/u
    );
  }
});

test("古诗文原句朗读后的右引号保留在朗读节点", () => {
  const script =
    "先读：“孤帆远影碧空尽。”这里的孤帆，是一叶孤单的帆船；再看远影，是远去的影子；最后的碧空尽，是碧蓝天空的尽头。";
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们跟着诗人的目光送别朋友。",
    [{
      id: "s1",
      text: "孤帆远影碧空尽。",
      script,
      points: [
        { id: "p1-1", term: "孤帆" },
        { id: "p1-2", term: "远影" },
        { id: "p1-3", term: "碧空尽" }
      ]
    }],
    "现在试着背诵。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");
  const firstFocusIndex = sentenceNodes.findIndex((node) => node.focus?.pointId === "p1-1");

  assert.equal(sentenceNodes.slice(0, firstFocusIndex).map((node) => node.script).join(""), "先读：“孤帆远影碧空尽。”");
  assert.match(sentenceNodes[firstFocusIndex]?.script ?? "", /^这里的孤帆/u);
});

test("古诗文原句朗读以分号结束时从分号后开始高亮", () => {
  const script =
    "先读一遍：孤帆远影碧空尽；这里的孤帆，是一叶孤单的帆船；再看远影，是远去的影子；最后的碧空尽，是碧蓝天空的尽头。";
  const nodes = buildEnglishNarrationNodeDrafts(
    "我们跟着诗人的目光送别朋友。",
    [{
      id: "s1",
      text: "孤帆远影碧空尽。",
      script,
      points: [
        { id: "p1-1", term: "孤帆" },
        { id: "p1-2", term: "远影" },
        { id: "p1-3", term: "碧空尽" }
      ]
    }],
    "现在试着背诵。"
  );
  const sentenceNodes = nodes.filter((node) => node.sentenceId === "s1");
  const firstFocusIndex = sentenceNodes.findIndex((node) => node.focus?.pointId === "p1-1");

  assert.equal(sentenceNodes.slice(0, firstFocusIndex).map((node) => node.script).join(""), "先读一遍：孤帆远影碧空尽；");
  assert.match(sentenceNodes[firstFocusIndex]?.script ?? "", /^这里的孤帆/u);
});

test("关键词释义必须在逐字稿中按 points 顺序逐个出现", () => {
  const points = [
    { id: "p1-1", term: "孤帆" },
    { id: "p1-2", term: "远影" },
    { id: "p1-3", term: "碧空尽" }
  ];

  assert.equal(
    englishNarrationPointsFollowScript("先讲孤帆，再看远影，最后说碧空尽。", points),
    true
  );
  assert.equal(
    englishNarrationPointsFollowScript("先讲远影，再回头解释孤帆，最后说碧空尽。", points),
    false
  );
  assert.equal(
    englishNarrationPointsFollowScript("只讲孤帆和碧空尽。", points),
    false
  );
});

test("古诗文高亮关键词必须同时存在于原文和口语讲稿", () => {
  const sourceText = "贤哉，回也！";
  const script = "这里的“德行”，意思是品德和修养；整句在赞美颜回。";
  const points = [{ id: "p1-1", term: "德行", meaning: "品德和修养" }];

  assert.deepEqual(
    alignEnglishNarrationPointsToScript(script, points, sourceText),
    []
  );
});

test("英文带学单句重合成只替换当前句的语音节点", () => {
  const replaceTargetNodes = Reflect.get(narrationNodes, "replaceEnglishNarrationTargetNodes");

  assert.equal(typeof replaceTargetNodes, "function");
  const existing = [
    { id: "intro", type: "INTRO", sentenceId: null, chunkType: "INTRO", script: "导入", focus: null, audioTaskId: "audio-intro", audioUrl: "https://example.com/intro.mp3", durationMs: 1000 },
    { id: "s1-c1", type: "SENTENCE", sentenceId: "s1", chunkType: "CONTEXT", script: "旧讲解", focus: null, audioTaskId: "audio-s1", audioUrl: "https://example.com/s1.mp3", durationMs: 1000 },
    { id: "summary", type: "SUMMARY", sentenceId: null, chunkType: "SUMMARY", script: "总结", focus: null, audioTaskId: "audio-summary", audioUrl: "https://example.com/summary.mp3", durationMs: 1000 }
  ];
  const replacement = [
    { id: "s1-c1", type: "SENTENCE", sentenceId: "s1", chunkType: "CONTEXT", script: "新讲解", focus: null, audioTaskId: "audio-s1-new", audioUrl: "https://example.com/s1-new.mp3", durationMs: 1200 }
  ];
  const merged = replaceTargetNodes(existing, replacement, {
    sentenceId: "s1",
    targetType: "SENTENCE"
  });

  assert.deepEqual(merged.map((node: { audioTaskId: string }) => node.audioTaskId), [
    "audio-intro",
    "audio-s1-new",
    "audio-summary"
  ]);
});
