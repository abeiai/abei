import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEnglishGuidedStudyReferenceMaterialsJson,
  extractEnglishGuidedStudyReferenceDocument,
  normalizeEnglishGuidedStudyReferenceMaterials
} from "../src/english-guided-study/english-guided-study-reference-materials.js";

test("英文带学参考资料规范化后具有稳定标识并保留固定释义", () => {
  const input = [
    {
      kind: "TEXT" as const,
      name: "重点词汇",
      content: "wander: 漫步；徘徊\nhost: 一大群"
    }
  ];
  const first = normalizeEnglishGuidedStudyReferenceMaterials(input);
  const second = normalizeEnglishGuidedStudyReferenceMaterials(input);

  assert.equal(first[0]?.id, second[0]?.id);
  assert.equal(first[0]?.content, "wander: 漫步；徘徊\nhost: 一大群");
});

test("英文带学长参考资料为当前批次保留相关词条且输出合法 JSON", () => {
  const filler = Array.from({ length: 2_500 }, (_, index) => `背景资料第 ${index + 1} 行`).join("\n");
  const materials = normalizeEnglishGuidedStudyReferenceMaterials([
    {
      id: "classic-translation",
      kind: "DOCUMENT",
      name: "经典译文与重点词汇.txt",
      content: `${filler}\nwander: 漫步；徘徊\ncloud: 云朵\n${filler}`
    },
    {
      id: "teacher-notes",
      kind: "DOCUMENT",
      name: "教师补充说明.txt",
      content: filler
    }
  ]);
  const promptValue = buildEnglishGuidedStudyReferenceMaterialsJson({
    batchCount: 3,
    batchIndex: 1,
    materials,
    sourceSegments: [{ id: "s2", text: "I wandered lonely as a cloud." }]
  });
  const parsed = JSON.parse(promptValue) as {
    available: boolean;
    materials: Array<{ content: string }>;
  };

  assert.equal(parsed.available, true);
  assert.match(parsed.materials[0]?.content ?? "", /wander: 漫步；徘徊/);
});

test("英文带学参考文档支持直接提取 TXT 文本", async () => {
  const document = await extractEnglishGuidedStudyReferenceDocument({
    originalname: "重点词汇.txt",
    mimetype: "text/plain",
    size: 42,
    buffer: Buffer.from("  gravity: 重力\r\n\r\n orbit: 轨道  ", "utf8")
  });

  assert.equal(document.kind, "DOCUMENT");
  assert.equal(document.name, "重点词汇.txt");
  assert.equal(document.content, "gravity: 重力\n\norbit: 轨道");
  assert.equal(document.truncated, false);
});

test("英文带学最多接受三个参考文档", () => {
  assert.throws(
    () => normalizeEnglishGuidedStudyReferenceMaterials(
      Array.from({ length: 4 }, (_, index) => ({
        kind: "DOCUMENT" as const,
        name: `参考文档${index + 1}.txt`,
        content: `第 ${index + 1} 份内容`
      }))
    ),
    /最多支持 3 个参考文档/
  );
});

test("英文带学拒绝超过 2 MB 的单个参考文档", async () => {
  await assert.rejects(
    () => extractEnglishGuidedStudyReferenceDocument({
      originalname: "过大文档.txt",
      mimetype: "text/plain",
      size: 2 * 1024 * 1024 + 1,
      buffer: Buffer.from("content")
    }),
    /超过 2 MB/
  );
});

test("英文带学录入文本不能超过一万字符", () => {
  assert.throws(
    () => normalizeEnglishGuidedStudyReferenceMaterials([
      {
        kind: "TEXT",
        name: "录入文本",
        content: "文".repeat(10_001)
      }
    ]),
    /录入文本不能超过 10,000 个字符/
  );
});
