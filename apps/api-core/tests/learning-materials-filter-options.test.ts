import assert from "node:assert/strict";
import test from "node:test";
import { buildTextbookVersionsBySubjectOptions } from "../src/learning-materials/learning-materials.service.js";

test("builds textbook version options grouped by subject", () => {
  const options = buildTextbookVersionsBySubjectOptions([
    { subject: "数学", version: "人教版" },
    { subject: "语文", version: "统编版" },
    { subject: "数学", version: "北师大版" },
    { subject: "数学", version: "人教版" },
    { subject: " ", version: "空学科版" },
    { subject: "英语", version: " " }
  ]);

  assert.deepEqual(options, {
    数学: [
      { value: "人教版", label: "人教版" },
      { value: "北师大版", label: "北师大版" }
    ],
    语文: [{ value: "统编版", label: "统编版" }]
  });
});
