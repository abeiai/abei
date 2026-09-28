import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEightLinePages,
  tokenizeEightLineInput,
} from "../src/components/zitie/eight-line-layout";

const baseOptions = {
  chars: Array.from("天地玄黄宇宙洪荒"),
  fontSize: 24,
  gridHeight: 120,
  gridWidth: 400,
  gridX: 40,
  gridY: 80,
  mode: "sample" as const,
};

test("八行笺在最右列从上到下排列后转入左侧列", () => {
  const [page] = buildEightLinePages(baseOptions);

  assert.equal(page.items[0]?.columnFromRight, 0);
  assert.equal(page.items[0]?.rowIndex, 0);
  assert.equal(page.items[1]?.columnFromRight, 0);
  assert.ok((page.items[1]?.y ?? 0) > (page.items[0]?.y ?? 0));
  assert.ok(page.items.some((item) => item.columnFromRight === 1));
  assert.ok(
    (page.items.find((item) => item.columnFromRight === 1)?.x ?? 0) <
      (page.items[0]?.x ?? 0),
  );
});

test("八行笺隔行只使用从右数奇数列", () => {
  const pages = buildEightLinePages({
    ...baseOptions,
    chars: Array.from("天".repeat(80)),
    mode: "alternate",
  });
  const usedColumns = new Set(
    pages[0]?.items.map((item) => item.columnFromRight),
  );

  assert.deepEqual([...usedColumns], [0, 2, 4, 6]);
});

test("八行笺写满可用列后自动分页且不丢字", () => {
  const chars = Array.from("字".repeat(200));
  const pages = buildEightLinePages({ ...baseOptions, chars });

  assert.ok(pages.length > 1);
  assert.equal(
    pages
      .flatMap((page) => page.items)
      .map((item) => item.text)
      .join(""),
    chars.join(""),
  );
});

test("八行笺保留换行、全角空格和每三个半角空格", () => {
  assert.deepEqual(
    tokenizeEightLineInput("天地　玄   黄  宇\n洪"),
    ["天", "地", " ", "玄", " ", "黄", "宇", "\n", "洪"],
  );
});

test("八行笺空格留位且换行后从下一可用列顶部继续", () => {
  const [samplePage] = buildEightLinePages({
    ...baseOptions,
    chars: ["天", " ", "地", "\n", "玄"],
  });
  const [alternatePage] = buildEightLinePages({
    ...baseOptions,
    chars: ["天", "\n", "地"],
    mode: "alternate",
  });

  assert.deepEqual(
    samplePage.items.map((item) => [item.text, item.columnFromRight, item.rowIndex]),
    [
      ["天", 0, 0],
      ["地", 0, 2],
      ["玄", 1, 0],
    ],
  );
  assert.deepEqual(
    alternatePage.items.map((item) => [item.text, item.columnFromRight, item.rowIndex]),
    [
      ["天", 0, 0],
      ["地", 2, 0],
    ],
  );
});

test("八行笺写满一列后换行不会额外跳过一列", () => {
  const [page] = buildEightLinePages({
    ...baseOptions,
    chars: ["天", "地", "玄", "黄", "\n", "宇"],
  });

  assert.deepEqual(
    page.items.map((item) => [item.text, item.columnFromRight, item.rowIndex]),
    [
      ["天", 0, 0],
      ["地", 0, 1],
      ["玄", 0, 2],
      ["黄", 0, 3],
      ["宇", 1, 0],
    ],
  );
});
