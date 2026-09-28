import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("./schema.prisma", import.meta.url);

test("平台英文内容库使用标准化模型并保持平台媒体无用户归属", async () => {
  const schema = await readFile(schemaUrl, "utf8");

  for (const model of [
    "EnglishContentLibrary",
    "EnglishContentUnit",
    "EnglishContentItem",
    "EnglishContentAcceptedAnswer",
    "EnglishContentMedia"
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`, "u"));
  }

  assert.match(schema, /sourceTextbook\s+LearningMaterialTextbook\?\s+@relation\(fields: \[sourceTextbookId\], references: \[id\], onDelete: SetNull\)/u);
  assert.match(schema, /dictionaryEntry\s+DictionaryEntry\?\s+@relation\(fields: \[dictionaryEntryId\], references: \[id\], onDelete: SetNull\)/u);
  assert.match(schema, /mediaAsset\s+MediaAsset\?\s+@relation\(fields: \[mediaAssetId\], references: \[id\], onDelete: SetNull\)/u);
  assert.match(schema, /@@unique\(\[libraryId, code\]\)/u);
  assert.match(schema, /@@unique\(\[unitId, sourceOrder\]\)/u);
  assert.match(schema, /@@unique\(\[itemId, normalizedAnswer\]\)/u);
  assert.match(schema, /@@unique\(\[itemId, kind\]\)/u);
  assert.match(
    schema,
    /enum EnglishContentEducationStage \{[\s\S]*?UNIVERSITY[\s\S]*?\}/u
  );
  assert.match(
    schema,
    /educationStage\s+EnglishContentEducationStage\?/u
  );
});
