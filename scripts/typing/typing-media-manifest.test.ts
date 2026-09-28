import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIllustrationPrompt,
  buildMediaAssetRegistration,
  canReuseTypingIllustration,
  slugifyTypingItem,
  typingMediaRelativePath
} from "./typing-media-manifest.js";

const item = {
  normalizedText: "greet",
  sourceOrder: 1,
  text: "greet",
  translation: "和某人打招呼"
};

test("媒体文件名和路径稳定且不允许目录穿越", () => {
  assert.equal(slugifyTypingItem("  Be Ready To Do Sth  "), "be-ready-to-do-sth");
  assert.equal(slugifyTypingItem("../../Good Luck!"), "good-luck");
  assert.equal(
    typingMediaRelativePath(item, 1, "ILLUSTRATION"),
    "uploads/typing-content/yl-7a/unit-01/images/01-greet.png"
  );
  assert.equal(
    typingMediaRelativePath(item, 1, "BRITISH_PRONUNCIATION"),
    "uploads/typing-content/yl-7a/unit-01/audio/01-greet.mp3"
  );
  assert.equal(
    typingMediaRelativePath(item, 3, "ILLUSTRATION", "yl-8b"),
    "uploads/typing-content/yl-8b/unit-03/images/01-greet.png"
  );
  assert.equal(
    typingMediaRelativePath(item, 2, "ILLUSTRATION", "yl-3a"),
    "uploads/typing-content/yl-3a/unit-02/images/01-greet.png"
  );
  assert.equal(
    typingMediaRelativePath(item, 4, "ILLUSTRATION", "yl-xb4"),
    "uploads/typing-content/yl-xb4/unit-04/images/01-greet.png"
  );
  assert.equal(
    typingMediaRelativePath(item, 1, "ILLUSTRATION", "hj-3a"),
    "uploads/typing-content/hj-3a/unit-01/images/01-greet.png"
  );
  assert.equal(
    typingMediaRelativePath(item, 6, "ILLUSTRATION", "hj-54-7b"),
    "uploads/typing-content/hj-54-7b/unit-06/images/01-greet.png"
  );
  assert.equal(
    typingMediaRelativePath(item, 4, "ILLUSTRATION", "hj-xb4"),
    "uploads/typing-content/hj-xb4/unit-04/images/01-greet.png"
  );
  assert.equal(
    typingMediaRelativePath(item, 2, "ILLUSTRATION", "pep-3a"),
    "uploads/typing-content/pep-3a/unit-02/images/01-greet.png"
  );
  assert.throws(
    () => typingMediaRelativePath(item, 1, "ILLUSTRATION", "../outside"),
    /媒体目录编号不合法/u
  );
});

test("只复用英文答案相同且中文核心释义重合的插图", () => {
  assert.equal(canReuseTypingIllustration(
    { ...item, translation: "挑战；质疑" },
    { ...item, translation: "挑战，向……挑战" }
  ), true);
  assert.equal(canReuseTypingIllustration(
    { ...item, normalizedText: "match", text: "match", translation: "比赛" },
    { ...item, normalizedText: "match", text: "match", translation: "匹配，相配" }
  ), false);
  assert.equal(canReuseTypingIllustration(
    { ...item, normalizedText: "path", text: "path", translation: "道路" },
    { ...item, normalizedText: "road", text: "road", translation: "道路" }
  ), true);
  assert.equal(canReuseTypingIllustration(
    { ...item, normalizedText: "urban", text: "urban", translation: "城市的" },
    { ...item, normalizedText: "city", text: "city", translation: "城市" }
  ), true);
  assert.equal(canReuseTypingIllustration(
    { ...item, normalizedText: "blooming", text: "blooming", translation: "盛开的，开花的" },
    { ...item, normalizedText: "unfold", text: "unfold", translation: "开花；展开，打开；展示，展现" }
  ), false);
  assert.equal(canReuseTypingIllustration(
    { ...item, normalizedText: "blooming", text: "blooming", translation: "盛开的，开花的" },
    { ...item, normalizedText: "fun", text: "fun", translation: "乐趣，快乐" }
  ), false);
  assert.equal(canReuseTypingIllustration(
    { ...item, normalizedText: "in person", text: "in person", translation: "亲自" },
    { ...item, normalizedText: "in person", text: "in person", translation: "本人到场" }
  ), true);
});

test("Unit 1 插图提示词描述具体场景并固定 4:3、3D 卡通和无文字约束", () => {
  const prompt = buildIllustrationPrompt(item);

  assert.match(prompt, /Use case: stylized-concept/u);
  assert.match(prompt, /two school students greeting each other/u);
  assert.match(prompt, /suitable for Chinese school learners/u);
  assert.match(prompt, /4:3 landscape/u);
  assert.match(prompt, /polished 3D cartoon/u);
  assert.match(prompt, /no text, no letters, no numbers, no logo, no watermark/u);
  assert.doesNotMatch(prompt, /Primary request:[^\n]*greet/iu);
});

test("品牌地点词汇使用无商标和无可识别角色的通用场景", () => {
  const prompt = buildIllustrationPrompt({
    normalizedText: "disneyland",
    sourceOrder: 1,
    text: "Disneyland",
    translation: "迪士尼乐园"
  });

  assert.match(prompt, /fantasy amusement park/u);
  assert.match(prompt, /no recognizable branded characters or trademarks/u);
  assert.doesNotMatch(prompt, /Disney/iu);
});

test("平台媒体登记数据使用 AI_GENERATED 且不绑定用户或管理员", () => {
  const registration = buildMediaAssetRegistration({
    kind: "ILLUSTRATION",
    relativePath: "uploads/typing-content/yl-7a/unit-01/images/01-greet.png",
    size: 1234
  });

  assert.deepEqual(registration, {
    createdByAdminId: null,
    createdByUserId: null,
    filename: "01-greet.png",
    mediaType: "IMAGE",
    mimeType: "image/png",
    originalName: "01-greet.png",
    size: 1234,
    sourceType: "AI_GENERATED",
    storageProvider: "LOCAL",
    url: "/uploads/typing-content/yl-7a/unit-01/images/01-greet.png"
  });
});
