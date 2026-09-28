import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import {
  compareSubtitleRows,
  extractReferenceSubtitleSegments
} from "../src/lib/video-guide-subtitle-comparison.js";

test("原文比对可直接解析普通文本并保留缩写", () => {
  assert.deepEqual(
    extractReferenceSubtitleSegments(
      "And he presided over the convention that created the U.S. Constitution. It established the framework."
    ),
    [
      "And he presided over the convention that created the U.S. Constitution.",
      "It established the framework."
    ]
  );
});

test("原文比对忽略 SRT 和 ASS 时间轴", () => {
  assert.deepEqual(
    extractReferenceSubtitleSegments(
      "1\n00:00:01,000 --> 00:00:03,000\nHello world.\n\n2\n00:00:04,000 --> 00:00:06,000\nHow are you?"
    ),
    ["Hello world.", "How are you?"]
  );
  assert.deepEqual(
    extractReferenceSubtitleSegments(
      "[Events]\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello world.\nDialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,How are you?"
    ),
    ["Hello world.", "How are you?"]
  );
});

test("原文比对只返回有差异的字幕并给出对应原文", () => {
  const differences = compareSubtitleRows(
    [
      { key: "one", text: "And he created the U. S. Constitution." },
      { key: "two", text: "It established the framework." }
    ],
    "And he created the U.S. Constitution. It established the framework."
  );

  assert.deepEqual(
    differences.map(({ key, recognizedText, referenceText }) => ({ key, recognizedText, referenceText })),
    [{
      key: "one",
      recognizedText: "And he created the U. S. Constitution.",
      referenceText: "And he created the U.S. Constitution."
    }]
  );
});

test("原文和识别字幕断句不同也能按顺序分配", () => {
  const differences = compareSubtitleRows(
    [
      { key: "one", text: "Hello word." },
      { key: "two", text: "How is you?" }
    ],
    "Hello world. How are you?"
  );

  assert.deepEqual(
    differences.map(({ key, referenceText }) => ({ key, referenceText })),
    [
      { key: "one", referenceText: "Hello world." },
      { key: "two", referenceText: "How are you?" }
    ]
  );
});

test("原文按完整句对应，不把下一句开头分给上一条字幕", () => {
  const differences = compareSubtitleRows(
    [
      { key: "one", text: "He served from seventeen eighty nine, to seventeen ninety seven." },
      { key: "two", text: "But he had many other accomplishments too." },
      { key: "three", text: "He owned thousands of hectares of land, in his home state of Virginia." }
    ],
    [
      "He served from 1789 to 1797.",
      "But he had many other accomplishments, too.",
      "He owned thousands of hectares of land in his home state of Virginia."
    ].join(" ")
  );

  assert.deepEqual(
    differences.map(({ key, referenceText }) => ({ key, referenceText })),
    [
      { key: "one", referenceText: "He served from 1789 to 1797." },
      { key: "two", referenceText: "But he had many other accomplishments, too." },
      {
        key: "three",
        referenceText: "He owned thousands of hectares of land in his home state of Virginia."
      }
    ]
  );
});

test("带时间轴原文先合并分块，再按完整句重新断句", () => {
  assert.deepEqual(
    extractReferenceSubtitleSegments(
      [
        "1",
        "00:00:01,000 --> 00:00:03,000",
        "He served from 1789",
        "",
        "2",
        "00:00:03,000 --> 00:00:05,000",
        "to 1797. But he had",
        "",
        "3",
        "00:00:05,000 --> 00:00:08,000",
        "many other accomplishments, too."
      ].join("\n")
    ),
    [
      "He served from 1789 to 1797.",
      "But he had many other accomplishments, too."
    ]
  );
});

test("识别字幕跨过原文句界时按文本内容重新定位边界", () => {
  assert.deepEqual(
    compareSubtitleRows(
      [
        { key: "one", text: "Hello world. How" },
        { key: "two", text: "are you?" }
      ],
      "Hello world. How are you?"
    ),
    []
  );
});

test("原文一句对应多条识别字幕时只在该句内部切分", () => {
  assert.deepEqual(
    compareSubtitleRows(
      [
        { key: "one", text: "Learning English takes time" },
        { key: "two", text: "and steady practice." }
      ],
      "Learning English takes time and steady practice."
    ),
    []
  );
});

test("原文断句保留句末缩写、带空格缩写和闭引号", () => {
  assert.deepEqual(
    extractReferenceSubtitleSegments(
      "He lived in the U.S. He later became president."
    ),
    ["He lived in the U.S.", "He later became president."]
  );
  assert.deepEqual(
    extractReferenceSubtitleSegments(
      "He studied the U. S. Constitution. It shaped the country."
    ),
    ["He studied the U. S. Constitution.", "It shaped the country."]
  );
  assert.deepEqual(
    extractReferenceSubtitleSegments(
      "She said \"Hello world.\" Then she left."
    ),
    ["She said \"Hello world.\"", "Then she left."]
  );
});

test("连续五条字幕跨句错位时仍能全局恢复对应边界", () => {
  assert.deepEqual(
    compareSubtitleRows(
      [
        { key: "one", text: "Alpha one. Bravo" },
        { key: "two", text: "two. Charlie" },
        { key: "three", text: "three. Delta" },
        { key: "four", text: "four. Echo" },
        { key: "five", text: "five." }
      ],
      "Alpha one. Bravo two. Charlie three. Delta four. Echo five."
    ),
    []
  );
});

test("原文对齐不会把开引号移动到上一条字幕", () => {
  assert.deepEqual(
    compareSubtitleRows(
      [
        { key: "one", text: "He said," },
        { key: "two", text: "\"Hello world.\"" }
      ],
      "He said, \"Hello world.\""
    ),
    []
  );
});

test("原文断句正确处理缩写后的连接词、姓名和闭引号", () => {
  assert.deepEqual(
    extractReferenceSubtitleSegments(
      "Relations between the U.S. and Canada improved."
    ),
    ["Relations between the U.S. and Canada improved."]
  );
  assert.deepEqual(
    extractReferenceSubtitleSegments(
      "He lived in the U.S. George moved later."
    ),
    ["He lived in the U.S.", "George moved later."]
  );
  assert.deepEqual(
    extractReferenceSubtitleSegments(
      "\"I live in the U.S.\" Then she left."
    ),
    ["\"I live in the U.S.\"", "Then she left."]
  );
});

test("成对引号始终归属于引语所在的字幕", () => {
  assert.deepEqual(
    compareSubtitleRows(
      [
        { key: "one", text: "He paused." },
        { key: "two", text: "\"Hello,\" she said." }
      ],
      "He paused. \"Hello,\" she said."
    ),
    []
  );
  assert.deepEqual(
    compareSubtitleRows(
      [
        { key: "one", text: "He said, \"Hello,\"" },
        { key: "two", text: "she replied." }
      ],
      "He said, \"Hello,\" she replied."
    ),
    []
  );
  assert.deepEqual(
    compareSubtitleRows(
      [
        { key: "one", text: "He called it" },
        { key: "two", text: "'remarkable.'" }
      ],
      "He called it 'remarkable.'"
    ),
    []
  );
});

test("局部识别词数膨胀后仍能在下一条字幕重新同步", () => {
  const sourceRows = Array.from(
    { length: 30 },
    (_, index) => `Sentence ${index} has stable words.`
  );
  const recognizedRows = sourceRows.map((text, index) => ({
    key: String(index),
    text: index === 0
      ? `${text.slice(0, -1)} ${Array.from({ length: 20 }, (_, word) => `extra${word}`).join(" ")}.`
      : text
  }));
  const differences = compareSubtitleRows(recognizedRows, sourceRows.join(" "));

  assert.deepEqual(differences.map(({ key }) => key), ["0"]);
});

test("缩写后的真实单词句不会被合并到上一句", () => {
  assert.deepEqual(
    extractReferenceSubtitleSegments(
      "He lived in the U.S. Stop! Then continue."
    ),
    ["He lived in the U.S.", "Stop!", "Then continue."]
  );
});

test("句子数量相同但字幕跨句时仍按实际文本边界对齐", () => {
  const differences = compareSubtitleRows(
    [
      { key: "one", text: "Alpha one. Bravo two." },
      { key: "two", text: "Charlie three." },
      { key: "three", text: "Delta four." }
    ],
    "Alpha one. Bravo two Charlie three. Delta four."
  );

  assert.deepEqual(
    differences.map(({ key, referenceText }) => ({ key, referenceText })),
    [{ key: "one", referenceText: "Alpha one. Bravo two" }]
  );
});

test("识别严重漏词时仍把完整原句对应到当前字幕", () => {
  const longSentence = [
    "This detailed reference sentence contains many important words",
    "that the recognition result accidentally omitted while processing",
    "the original recording for comparison today"
  ].join(" ");
  const differences = compareSubtitleRows(
    [
      { key: "one", text: "This sentence" },
      { key: "two", text: "The next sentence remains correctly aligned." }
    ],
    `${longSentence}. The next sentence remains correctly aligned.`
  );

  assert.deepEqual(
    differences.map(({ key, referenceText }) => ({ key, referenceText })),
    [{ key: "one", referenceText: `${longSentence}.` }]
  );
});

test("大量字幕存在稳定词数差异时比对不会阻塞页面", () => {
  const referenceRows = Array.from(
    { length: 80 },
    (_, index) => `Reference sentence ${index} keeps a stable ending.`
  );
  const recognizedRows = referenceRows.map((text, index) => ({
    key: String(index),
    text: `${text.slice(0, -1)} with three extra words`
  }));
  const startedAt = performance.now();
  const differences = compareSubtitleRows(recognizedRows, referenceRows.join(" "));
  const elapsed = performance.now() - startedAt;

  assert.equal(differences.length, 80);
  assert.equal(differences[0]?.referenceText, referenceRows[0]);
  assert.equal(differences.at(-1)?.referenceText, referenceRows.at(-1));
  assert.ok(elapsed < 2_000, `原文比对耗时 ${Math.round(elapsed)}ms，超过 2000ms`);
});

test("大量字幕出现跨句边界时全局搜索耗时仍然有界", () => {
  const referenceRows = Array.from(
    { length: 60 },
    (_, index) => `Reference sentence ${index} keeps a stable ending.`
  );
  const recognizedRows = referenceRows.map((text, index) => ({
    key: String(index),
    text: `${text.slice(0, -1)} with three extra words`
  }));
  recognizedRows[0].text = `${referenceRows[0]} Reference`;
  recognizedRows[1].text = "sentence 1 keeps a stable ending with three extra words";
  const startedAt = performance.now();
  const differences = compareSubtitleRows(recognizedRows, referenceRows.join(" "));
  const elapsed = performance.now() - startedAt;
  const differencesByKey = new Map(
    differences.map((difference) => [difference.key, difference])
  );

  assert.equal(differencesByKey.has("0"), false);
  assert.equal(
    differencesByKey.get("1")?.referenceText,
    "sentence 1 keeps a stable ending."
  );
  assert.ok(elapsed < 2_000, `跨句原文比对耗时 ${Math.round(elapsed)}ms，超过 2000ms`);
});

test("重复句首时仍按实际跨句边界对齐", () => {
  const rows = [
    {
      key: "one",
      text: [
        "We can see alpha beta gamma delta epsilon zeta eta theta iota kappa lambda.",
        "We can see red;"
      ].join(" ")
    },
    {
      key: "two",
      text: "we can see four five six seven eight nine ten."
    }
  ];
  const referenceSource = [
    "We can see alpha beta gamma delta epsilon zeta eta theta iota kappa lambda.",
    "We can see red; we can see four five six seven eight nine ten."
  ].join(" ");

  assert.deepEqual(compareSubtitleRows(rows, referenceSource), []);
});

test("重复 token 不会把下一句开头吸收到上一条字幕", () => {
  const differences = compareSubtitleRows(
    [
      { key: "0", text: "We can see the thing and we can see item 0." },
      { key: "1", text: "We can see and we can see item 1." }
    ],
    [
      "We can see the thing and we can see item 0.",
      "We can see the thing and we can see item 1."
    ].join(" ")
  );

  assert.deepEqual(
    differences.map(({ key, referenceText }) => ({ key, referenceText })),
    [{
      key: "1",
      referenceText: "We can see the thing and we can see item 1."
    }]
  );
});

test("没有公共 token 时有终止标点的字幕优先对应完整原句", () => {
  const differences = compareSubtitleRows(
    [
      {
        key: "one",
        text: "Seventeen eighty-nine through seventeen ninety-seven."
      },
      {
        key: "two",
        text: "Additional achievements."
      }
    ],
    "1789 to 1797. Many other accomplishments."
  );

  assert.deepEqual(
    differences.map(({ key, referenceText }) => ({ key, referenceText })),
    [
      { key: "one", referenceText: "1789 to 1797." },
      { key: "two", referenceText: "Many other accomplishments." }
    ]
  );
});

test("连续前缀缺少句尾内容时不会被误锁为完整字幕", () => {
  const differences = compareSubtitleRows(
    [
      { key: "0", text: "The quick brown fox." },
      { key: "1", text: "Middle sentance has an error." },
      { key: "2", text: "Final sentence is stable." }
    ],
    [
      "The quick brown fox jumps very high.",
      "Middle sentence has an error.",
      "Final sentence is stable."
    ].join(" ")
  );

  assert.deepEqual(
    differences.map(({ key, referenceText }) => ({ key, referenceText })),
    [
      {
        key: "0",
        referenceText: "The quick brown fox jumps very high."
      },
      {
        key: "1",
        referenceText: "Middle sentence has an error."
      }
    ]
  );
});

test("下一句重复短语不会掩盖当前句遗漏的句尾", () => {
  const differences = compareSubtitleRows(
    [
      { key: "0", text: "Alpha beta." },
      { key: "1", text: "We can continue." }
    ],
    "Alpha beta we can. We can continue."
  );

  assert.deepEqual(
    differences.map(({ key, referenceText }) => ({ key, referenceText })),
    [{
      key: "0",
      referenceText: "Alpha beta we can."
    }]
  );
});
