import assert from "node:assert/strict";
import test from "node:test";

import { projectPublicCourseMaterial } from "../src/courses/course-domain.js";
import {
  alignReadAlongCuesToSource,
  alignReadAlongWordsToText,
  buildEnglishReadAlongSourceUnits,
  buildGeneratedReadAlongTrack,
  buildUploadedReadAlongTrack,
  readAlongCheckpointNodes,
  unreferencedReadAlongTaskIds
} from "../src/english-guided-study/english-guided-study-read-along.js";

const sentences = [
  { id: "s1", text: "Two roads diverged in a yellow wood," },
  { id: "s2", text: "And sorry I could not travel both." }
];

test("标题、作者与正文生成独立跟读单元并去除正文开头的重复信息", () => {
  const units = buildEnglishReadAlongSourceUnits({
    author: "Robert Frost",
    sentences: [
      { id: "title", text: "The Road Not Taken" },
      { id: "author", text: "Robert Frost" },
      ...sentences
    ],
    title: "The Road Not Taken"
  });

  assert.deepEqual(
    units.map((unit) => [unit.type, unit.sentenceId, unit.text]),
    [
      ["TITLE", null, "The Road Not Taken"],
      ["AUTHOR", null, "Robert Frost"],
      ["BODY", "s1", sentences[0]!.text],
      ["BODY", "s2", sentences[1]!.text]
    ]
  );
});

test("按逐句音频真实时长生成跟读轨道和 SRT", () => {
  const track = buildGeneratedReadAlongTrack({
    nodes: [
      {
        audioTaskId: "audio-1",
        audioUrl: "https://example.com/s1.mp3",
        durationMs: 2450,
        unitId: "read-along-body-s1",
        unitType: "BODY",
        sentenceId: "s1",
        text: sentences[0]!.text,
        words: [
          { text: "Two", startChar: 0, endChar: 3, startSeconds: 0.1, endSeconds: 0.4 },
          { text: "roads", startChar: 4, endChar: 9, startSeconds: 0.4, endSeconds: 0.8 }
        ]
      },
      {
        audioTaskId: "audio-2",
        audioUrl: "https://example.com/s2.mp3",
        durationMs: 3100,
        unitId: "read-along-body-s2",
        unitType: "BODY",
        sentenceId: "s2",
        text: sentences[1]!.text,
        words: [
          { text: "And", startChar: 0, endChar: 3, startSeconds: 0.2, endSeconds: 0.5 }
        ]
      }
    ],
    voice: "longanyang"
  });

  assert.equal(track.version, 2);
  assert.equal(track.durationMs, 5550);
  assert.equal(track.cues[0]?.startSeconds, 0);
  assert.equal(track.cues[0]?.endSeconds, 2.45);
  assert.equal(track.cues[1]?.startSeconds, 2.45);
  assert.equal(track.cues[1]?.endSeconds, 5.55);
  assert.match(track.srtText, /00:00:02,450 --> 00:00:05,550/);
  assert.match(track.srtText, /And sorry I could not travel both\./);
  assert.equal(track.cues[1]?.words[0]?.startSeconds, 2.65);
  assert.equal(track.cues[1]?.words[0]?.startChar, 0);
});

test("上传音频按单词时间轴识别标题并允许作者缺失", () => {
  const units = buildEnglishReadAlongSourceUnits({
    author: "Robert Frost",
    sentences: [{ id: "s1", text: "Two roads diverged." }],
    title: "The Road Not Taken"
  });
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-words",
    audioName: "reading.mp3",
    audioUrl: "https://example.com/reading.mp3",
    durationMs: 3200,
    recognizedSrt: "",
    recognizedWords: [
      { text: "The", startSeconds: 0, endSeconds: 0.2 },
      { text: "Road", startSeconds: 0.2, endSeconds: 0.5 },
      { text: "Not", startSeconds: 0.5, endSeconds: 0.7 },
      { text: "Taken", startSeconds: 0.7, endSeconds: 1 },
      { text: "Two", startSeconds: 1.4, endSeconds: 1.7 },
      { text: "roads", startSeconds: 1.7, endSeconds: 2.1 },
      { text: "diverged", startSeconds: 2.1, endSeconds: 2.8 }
    ],
    units
  });

  assert.deepEqual(track.cues.map((cue) => cue.unitType), ["TITLE", "BODY"]);
  assert.equal(track.cues[0]?.words[1]?.text, "Road");
  assert.equal(track.cues[1]?.words[2]?.endSeconds, 2.8);
  assert.equal(track.cues[1]?.timingSource, "ASR_WORDS");
});

test("连字符标题在 ASR 拆成多个词时仍保留标题节点", () => {
  const units = buildEnglishReadAlongSourceUnits({
    author: null,
    sentences: [{ id: "s1", text: "Who stole sleep from baby's eyes?" }],
    title: "Sleep-Stealer"
  });
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-hyphenated-title",
    audioName: "reading.mp3",
    audioUrl: "https://example.com/reading.mp3",
    durationMs: 3200,
    recognizedSrt: "",
    recognizedWords: [
      { text: "Sleep", startSeconds: 0, endSeconds: 0.4 },
      { text: "Stealer", startSeconds: 0.4, endSeconds: 0.9 },
      { text: "Who", startSeconds: 1.2, endSeconds: 1.5 },
      { text: "stole", startSeconds: 1.5, endSeconds: 1.9 },
      { text: "sleep", startSeconds: 1.9, endSeconds: 2.3 },
      { text: "from", startSeconds: 2.3, endSeconds: 2.6 },
      { text: "baby's", startSeconds: 2.6, endSeconds: 2.9 },
      { text: "eyes", startSeconds: 2.9, endSeconds: 3.2 }
    ],
    units
  });

  assert.deepEqual(track.cues.map((cue) => cue.unitType), ["TITLE", "BODY"]);
  assert.equal(track.cues[0]?.text, "Sleep-Stealer");
  assert.deepEqual(track.cues[0]?.words.map((word) => word.text), ["Sleep", "Stealer"]);
  assert.deepEqual(
    track.cues[0]?.words.map((word) => [word.startChar, word.endChar]),
    [[0, 5], [6, 13]]
  );
  assert.match(track.srtText, /Sleep-Stealer/);
  assert.equal(track.cues[1]?.timingSource, "ASR_WORDS");
});

test("连字符标题在 ASR 合并为一个词时仍保留标题节点", () => {
  const units = buildEnglishReadAlongSourceUnits({
    author: null,
    sentences: [{ id: "s1", text: "Who stole sleep from baby's eyes?" }],
    title: "Sleep-Stealer"
  });
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-merged-hyphenated-title",
    audioName: "reading.mp3",
    audioUrl: "https://example.com/reading.mp3",
    durationMs: 3200,
    recognizedSrt: "",
    recognizedWords: [
      { text: "SleepStealer", startSeconds: 0, endSeconds: 0.9 },
      { text: "Who", startSeconds: 1.2, endSeconds: 1.5 },
      { text: "stole", startSeconds: 1.5, endSeconds: 1.9 },
      { text: "sleep", startSeconds: 1.9, endSeconds: 2.3 },
      { text: "from", startSeconds: 2.3, endSeconds: 2.6 },
      { text: "baby's", startSeconds: 2.6, endSeconds: 2.9 },
      { text: "eyes", startSeconds: 2.9, endSeconds: 3.2 }
    ],
    units
  });

  assert.deepEqual(track.cues.map((cue) => cue.unitType), ["TITLE", "BODY"]);
  assert.equal(track.cues[0]?.text, "Sleep-Stealer");
  assert.deepEqual(track.cues[0]?.words.map((word) => word.text), ["Sleep", "Stealer"]);
  assert.equal(track.cues[0]?.words[0]?.startSeconds, 0);
  assert.equal(track.cues[0]?.words.at(-1)?.endSeconds, 0.9);
  assert.ok(track.cues[0]!.words.every((word) => word.endSeconds > word.startSeconds));
  assert.equal(track.cues[0]?.timingSource, "ASR_WORDS");
});

test("单节点连字符原文兼容 ASR 合并词", () => {
  const words = alignReadAlongWordsToText(
    "Sleep-Stealer",
    [{ text: "SleepStealer", startSeconds: 0, endSeconds: 0.9 }],
    900
  );

  assert.deepEqual(words.map((word) => word.text), ["Sleep", "Stealer"]);
  assert.equal(words[0]?.startSeconds, 0);
  assert.equal(words.at(-1)?.endSeconds, 0.9);
});

test("正文中的合并词不会被未朗读的连字符标题占用", () => {
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-omitted-hyphenated-title",
    audioName: "reading.mp3",
    audioUrl: "https://example.com/reading.mp3",
    durationMs: 1200,
    recognizedSrt: "",
    recognizedWords: [
      { text: "Email", startSeconds: 0, endSeconds: 0.5 },
      { text: "arrives", startSeconds: 0.5, endSeconds: 1.2 }
    ],
    units: buildEnglishReadAlongSourceUnits({
      author: null,
      sentences: [{ id: "s1", text: "Email arrives." }],
      title: "E-mail"
    })
  });

  assert.deepEqual(track.cues.map((cue) => cue.unitType), ["BODY"]);
  assert.deepEqual(track.cues[0]?.words.map((word) => word.text), ["Email", "arrives"]);
  assert.equal(track.cues[0]?.words[0]?.startSeconds, 0);
});

test("连字符标题合并识别有一个字符误差时仍可对齐", () => {
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-fuzzy-hyphenated-title",
    audioName: "reading.mp3",
    audioUrl: "https://example.com/reading.mp3",
    durationMs: 1800,
    recognizedSrt: "",
    recognizedWords: [
      { text: "SleepStealor", startSeconds: 0, endSeconds: 0.8 },
      { text: "Begins", startSeconds: 1, endSeconds: 1.8 }
    ],
    units: buildEnglishReadAlongSourceUnits({
      author: null,
      sentences: [{ id: "s1", text: "Begins." }],
      title: "Sleep-Stealer"
    })
  });

  assert.deepEqual(track.cues.map((cue) => cue.unitType), ["TITLE", "BODY"]);
  assert.equal(track.cues[0]?.timingSource, "ASR_WORDS");
});

test("过短的合并词时间轴不会生成零时长单词", () => {
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-short-hyphenated-title",
    audioName: "reading.mp3",
    audioUrl: "https://example.com/reading.mp3",
    durationMs: 1000,
    recognizedSrt: "",
    recognizedWords: [
      { text: "AB", startSeconds: 0, endSeconds: 0.001 },
      { text: "Begins", startSeconds: 0.1, endSeconds: 1 }
    ],
    units: buildEnglishReadAlongSourceUnits({
      author: null,
      sentences: [{ id: "s1", text: "Begins." }],
      title: "A-B"
    })
  });

  assert.deepEqual(track.cues.map((cue) => cue.unitType), ["BODY"]);
  assert.ok(track.cues.flatMap((cue) => cue.words)
    .every((word) => word.endSeconds > word.startSeconds));
});

test("古诗文上传音频准确保留中文标题、作者和正文时间轴", () => {
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-gushiwen",
    audioName: "静夜思.mp3",
    audioUrl: "https://example.com/jing-ye-si.mp3",
    durationMs: 3200,
    recognizedSrt: "",
    recognizedWords: [
      { text: "静夜思", startSeconds: 0.1, endSeconds: 0.7 },
      { text: "李白", startSeconds: 0.9, endSeconds: 1.3 },
      { text: "床前明月光", startSeconds: 1.6, endSeconds: 2.6 }
    ],
    units: buildEnglishReadAlongSourceUnits({
      author: "李白",
      sentences: [{ id: "s1", text: "床前明月光" }],
      title: "静夜思"
    })
  });

  assert.deepEqual(track.cues.map((cue) => cue.unitType), ["TITLE", "AUTHOR", "BODY"]);
  assert.deepEqual(
    track.cues.map((cue) => cue.words.map((word) => word.text).join("")),
    ["静夜思", "李白", "床前明月光"]
  );
  assert.equal(track.cues[0]?.words[0]?.startSeconds, 0.1);
  assert.equal(track.cues[1]?.words.at(-1)?.endSeconds, 1.3);
  assert.equal(track.cues[2]?.words.at(-1)?.endSeconds, 2.6);
  assert.ok(track.cues[0]!.endSeconds <= track.cues[1]!.startSeconds);
  assert.ok(track.cues[1]!.endSeconds <= track.cues[2]!.startSeconds);
});

test("古诗文未朗读句末篇名时不会占用下一句的同字时间轴", () => {
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-gushiwen-omitted-citation",
    audioName: "论语节选.mp3",
    audioUrl: "https://example.com/lunyu.mp3",
    durationMs: 2000,
    recognizedSrt: "",
    recognizedWords: [
      { text: "人", startSeconds: 0.1, endSeconds: 0.2 },
      { text: "不", startSeconds: 0.2, endSeconds: 0.3 },
      { text: "知", startSeconds: 0.3, endSeconds: 0.4 },
      { text: "而", startSeconds: 0.4, endSeconds: 0.5 },
      { text: "不", startSeconds: 0.5, endSeconds: 0.6 },
      { text: "愠", startSeconds: 0.6, endSeconds: 0.7 },
      { text: "曾", startSeconds: 1, endSeconds: 1.1 },
      { text: "子", startSeconds: 1.1, endSeconds: 1.2 },
      { text: "曰", startSeconds: 1.2, endSeconds: 1.3 },
      { text: "学", startSeconds: 1.3, endSeconds: 1.4 },
      { text: "而", startSeconds: 1.4, endSeconds: 1.5 },
      { text: "不", startSeconds: 1.5, endSeconds: 1.6 },
      { text: "思", startSeconds: 1.6, endSeconds: 1.7 }
    ],
    units: buildEnglishReadAlongSourceUnits({
      author: null,
      sentences: [
        { id: "s1", text: "人不知而不愠。（《学而》）" },
        { id: "s2", text: "曾子曰：学而不思。" }
      ],
      title: null
    })
  });

  assert.equal(track.cues[0]?.timingSource, "ASR_WORDS");
  assert.ok(track.cues[0]!.endSeconds <= 1);
  assert.equal(track.cues[0]?.words.map((word) => word.text).join(""), "人不知而不愠");
  assert.equal(track.cues[0]?.words.at(-1)?.endSeconds, 0.7);
  assert.equal(track.cues[1]?.timingSource, "ASR_WORDS");
  assert.equal(track.cues[1]?.words[0]?.text, "曾");
  assert.equal(track.cues[1]?.words[0]?.startSeconds, 1);
  assert.equal(track.cues[1]?.words.at(-1)?.text, "思");
  assert.equal(track.cues[1]?.words.at(-1)?.endSeconds, 1.7);
});

test("长篇古文连续漏读超过初始带宽时仍保留后续逐字时间轴", () => {
  const sourceLength = 1415;
  const omittedStart = 500;
  const omittedLength = 97;
  const sourceCharacters = Array.from(
    { length: sourceLength },
    (_value, index) => String.fromCodePoint(0x4e00 + index)
  );
  const spokenCharacters = [
    ...sourceCharacters.slice(0, omittedStart),
    ...sourceCharacters.slice(omittedStart + omittedLength),
    ...Array.from(
      { length: omittedLength },
      (_value, index) => String.fromCodePoint(0x7000 + index)
    )
  ];
  const recognizedWords = spokenCharacters.map((text, index) => ({
    text,
    startSeconds: index / 100,
    endSeconds: (index + 1) / 100
  }));
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-long-gushiwen-with-omission",
    audioName: "长篇古文.mp3",
    audioUrl: "https://example.com/long-gushiwen.mp3",
    durationMs: sourceLength * 10,
    recognizedSrt: "",
    recognizedWords,
    units: buildEnglishReadAlongSourceUnits({
      author: null,
      sentences: [{ id: "s1", text: sourceCharacters.join("") }],
      title: null
    })
  });

  assert.equal(track.cues[0]?.timingSource, "ASR_WORDS");
  assert.equal(track.cues[0]?.words.length, sourceLength);
  assert.equal(
    track.cues[0]?.words[omittedStart + omittedLength]?.startSeconds,
    recognizedWords[omittedStart]?.startSeconds
  );
  assert.equal(
    track.cues[0]?.words.at(-1)?.endSeconds,
    recognizedWords[sourceLength - omittedLength - 1]?.endSeconds
  );
});

test("长篇古文与识别结果无关时快速降级而不扩展到完整矩阵", () => {
  const sourceLength = 3000;
  const sourceText = Array.from(
    { length: sourceLength },
    (_value, index) => String.fromCodePoint(0x4e00 + index)
  ).join("");
  const recognizedWords = Array.from({ length: sourceLength }, (_value, index) => ({
    text: String.fromCodePoint(0x7000 + index),
    startSeconds: index / 100,
    endSeconds: (index + 1) / 100
  }));
  const startedAt = Date.now();
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-unrelated-long-gushiwen",
    audioName: "无关朗读.mp3",
    audioUrl: "https://example.com/unrelated-long-gushiwen.mp3",
    durationMs: sourceLength * 10,
    recognizedSrt: "",
    recognizedWords,
    units: buildEnglishReadAlongSourceUnits({
      author: null,
      sentences: [{ id: "s1", text: sourceText }],
      title: null
    })
  });

  assert.equal(track.cues[0]?.timingSource, "DURATION_ESTIMATE");
  assert.equal(track.cues[0]?.words.length, 0);
  assert.ok(Date.now() - startedAt < 2000);
});

test("上传音频从正文开始且首词与标题相同时不会误判为已朗读标题", () => {
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-without-title",
    audioName: "reading.mp3",
    audioUrl: "https://example.com/reading.mp3",
    durationMs: 1200,
    recognizedSrt: "",
    recognizedWords: [
      { text: "Hello", startSeconds: 0.1, endSeconds: 0.5 },
      { text: "world", startSeconds: 0.5, endSeconds: 1 }
    ],
    units: buildEnglishReadAlongSourceUnits({
      author: null,
      sentences: [{ id: "s1", text: "Hello world." }],
      title: "Hello"
    })
  });

  assert.deepEqual(track.cues.map((cue) => cue.unitType), ["BODY"]);
  assert.equal(track.cues[0]?.words[0]?.text, "Hello");
});

test("单词时间轴保留缩写词在原文中的字符位置", () => {
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-contraction",
    audioName: "reading.mp3",
    audioUrl: "https://example.com/reading.mp3",
    durationMs: 1500,
    recognizedSrt: "",
    recognizedWords: [
      { text: "Let's", startSeconds: 0.1, endSeconds: 0.5 },
      { text: "begin", startSeconds: 0.5, endSeconds: 1.1 }
    ],
    units: buildEnglishReadAlongSourceUnits({
      author: null,
      sentences: [{ id: "s1", text: "Let's begin." }],
      title: null
    })
  });

  assert.deepEqual(
    track.cues[0]?.words.map((word) => [word.text, word.startChar, word.endChar]),
    [["Let's", 0, 5], ["begin", 6, 11]]
  );
});

test("识别缺少某句时回退字幕不会与下一句真实时间重叠", () => {
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-missing-sentence",
    audioName: "reading.mp3",
    audioUrl: "https://example.com/reading.mp3",
    durationMs: 2000,
    recognizedSrt: "",
    recognizedWords: [
      { text: "Hello", startSeconds: 0.2, endSeconds: 0.6 },
      { text: "world", startSeconds: 0.6, endSeconds: 1.1 }
    ],
    units: buildEnglishReadAlongSourceUnits({
      author: null,
      sentences: [
        { id: "s1", text: "Missing words." },
        { id: "s2", text: "Hello world." }
      ],
      title: null
    })
  });

  assert.ok(track.cues[0]!.endSeconds <= track.cues[1]!.startSeconds);
  assert.ok(track.cues.every((cue) => cue.endSeconds > cue.startSeconds));
});

test("将上传音频识别出的字幕重新映射为带学文稿断句", () => {
  const cues = alignReadAlongCuesToSource(sentences, [
    {
      startSeconds: 0.2,
      endSeconds: 1.4,
      text: "Two roads diverged"
    },
    {
      startSeconds: 1.4,
      endSeconds: 3.2,
      text: "in a yellow wood"
    },
    {
      startSeconds: 3.5,
      endSeconds: 6.8,
      text: "And sorry I could not travel both"
    }
  ]);

  assert.deepEqual(cues.map((cue) => cue.sentenceId), ["s1", "s2"]);
  assert.deepEqual(cues.map((cue) => cue.text), sentences.map((sentence) => sentence.text));
  assert.equal(cues[0]?.startSeconds, 0.2);
  assert.ok((cues[0]?.endSeconds ?? 0) >= 3.2);
  assert.equal(cues[1]?.endSeconds, 6.8);
});

test("识别字幕块少于原文断句时所有字幕仍限制在音频时间轴内", () => {
  const manySentences = Array.from({ length: 30 }, (_, index) => ({
    id: `s${index + 1}`,
    text: `This is sentence number ${index + 1}.`
  }));
  const cues = alignReadAlongCuesToSource(manySentences, [
    {
      startSeconds: 0.2,
      endSeconds: 1,
      text: "Short recognized audio"
    }
  ]);

  assert.equal(cues.length, manySentences.length);
  assert.equal(cues[0]?.startSeconds, 0.2);
  assert.equal(cues.at(-1)?.endSeconds, 1);
  assert.ok(cues.every((cue) => cue.endSeconds > cue.startSeconds));
  assert.ok(cues.every((cue) => cue.endSeconds <= 1));
});

test("恢复任务只复用与当前原文连续匹配的已生成诵读节点", () => {
  const units = buildEnglishReadAlongSourceUnits({ author: null, sentences, title: null });
  const resumed = readAlongCheckpointNodes([
    {
      id: "read-along-node-1",
      unitId: "read-along-body-s1",
      unitType: "BODY",
      sentenceId: "s1",
      text: sentences[0]!.text,
      audioTaskId: "audio-1",
      audioUrl: "https://example.com/s1.mp3",
      durationMs: 2450,
      words: []
    },
    {
      id: "read-along-node-2",
      unitId: "read-along-body-s2",
      unitType: "BODY",
      sentenceId: "different-sentence",
      text: sentences[1]!.text,
      audioTaskId: "audio-2",
      audioUrl: "https://example.com/s2.mp3",
      durationMs: 3100,
      words: []
    }
  ], units);

  assert.equal(resumed.length, 1);
  assert.equal(resumed[0]?.audioTaskId, "audio-1");
});

test("租约切换后只清理未被检查点或成品引用的诵读任务", () => {
  assert.deepEqual(
    unreferencedReadAlongTaskIds(
      ["audio-before-checkpoint", "audio-in-checkpoint", "audio-before-checkpoint"],
      ["audio-in-checkpoint"]
    ),
    ["audio-before-checkpoint"]
  );
});

test("ASR 暂不可用时按音频真实时长生成断句 SRT", () => {
  const track = buildUploadedReadAlongTrack({
    audioAssetId: "uploaded-1",
    audioName: "reading.mp3",
    audioUrl: "https://example.com/reading.mp3",
    durationMs: 7000,
    recognizedSrt: "",
    recognizedWords: [],
    units: buildEnglishReadAlongSourceUnits({ author: null, sentences, title: null })
  });

  assert.equal(track.durationMs, 7000);
  assert.equal(track.cues.length, 2);
  assert.equal(track.cues[0]?.startSeconds, 0);
  assert.equal(track.cues[1]?.endSeconds, 7);
  assert.ok(track.cues.every((cue) => cue.words.length === 0));
  assert.match(track.srtText, /Two roads diverged in a yellow wood/);
});

test("公开学习页保留跟读单元类型和单词时间轴", () => {
  const projected = projectPublicCourseMaterial("ENGLISH_GUIDED_STUDY", {
    title: "Hello",
    content: {
      readAlong: {
        version: 2,
        source: "UPLOAD",
        audioUrl: "https://example.com/reading.mp3",
        audioName: "reading.mp3",
        durationMs: 1000,
        srtText: "",
        voice: null,
        nodes: [],
        cues: [
          {
            id: "cue-1",
            unitId: "read-along-body-s1",
            unitType: "BODY",
            sentenceId: "s1",
            text: "Hello.",
            startSeconds: 0,
            endSeconds: 1,
            timingSource: "ASR_WORDS",
            words: [
              { text: "Hello", startChar: 0, endChar: 5, startSeconds: 0.1, endSeconds: 0.8 }
            ]
          }
        ]
      }
    }
  }) as { readAlong?: { cues?: Array<Record<string, unknown>> } };

  assert.equal(projected.readAlong?.cues?.[0]?.unitType, "BODY");
  assert.deepEqual(projected.readAlong?.cues?.[0]?.words, [
    { text: "Hello", startChar: 0, endChar: 5, startSeconds: 0.1, endSeconds: 0.8 }
  ]);
});
