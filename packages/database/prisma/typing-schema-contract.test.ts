import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("./schema.prisma", import.meta.url);

test("打字记词业务数据按主体隔离并为会话与提交提供幂等约束", async () => {
  const schema = await readFile(schemaUrl, "utf8");

  for (const model of [
    "TypingLibraryProgress",
    "TypingPracticeSession",
    "TypingPracticeSessionItem",
    "TypingAttempt",
    "TypingReviewState",
    "TypingPreference"
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`, "u"));
  }

  assert.match(schema, /@@unique\(\[subjectKey, libraryId\]\)/u);
  assert.match(schema, /@@unique\(\[subjectKey, itemId\]\)/u);
  assert.match(schema, /clientSessionKey\s+String\s+@unique/u);
  assert.match(schema, /clientAttemptId\s+String\s+@unique/u);
  assert.match(schema, /answerSnapshot\s+String\s+@db\.Text/u);
  assert.match(schema, /session\s+TypingPracticeSession\s+@relation\(fields: \[sessionId\], references: \[id\], onDelete: Cascade\)/u);
  assert.match(schema, /sessionItem\s+TypingPracticeSessionItem\s+@relation\(fields: \[sessionItemId\], references: \[id\], onDelete: Cascade\)/u);
  assert.match(schema, /reviewStates\s+TypingReviewState\[\]/u);
  assert.match(schema, /typingSessions\s+TypingPracticeSession\[\]/u);
});
