# Eight-Line Copybook Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `/zitie` 新增八行笺模板，实现从右向左、列内从上到下的示范字排版，并向所有模板增加通用“示范”排版模式。

**Architecture:** 使用纯函数生成八行笺每页的竖排坐标，由前端组装为现有 Layout JSON。新增 `grid.variant = "eight-line"`，前端 SVG 和 API SVG 各自使用相同参数绘制一个粗外框和七条细竖线；PDF 仍从 API 输出的同一 SVG 转换。

**Tech Stack:** Next.js App Router, React, TypeScript, SVG, NestJS, Node test runner, svg-to-pdfkit

## Global Constraints

- 所有新增用户界面文案使用简体中文。
- 页面路由保持 `/zitie`，本地 Web 端口保持 `3321`。
- 禁止 Canvas、HTML 转 PDF 和 CSS 流式排版；内容坐标全部写入 Layout JSON。
- `1 SVG unit = 1 PDF point`，前端 SVG 和 API SVG 不得重新排版内容。
- 不使用 `textLength`、`lengthAdjust` 或非等比缩放改变字体比例。
- 八行笺固定 8 列，示范模式使用全部 8 列，隔行模式使用从右数第 1、3、5、7 列。
- 示范模式只输出深色示范内容，描写数量固定为 0。
- 不修改数据库 schema、扣点、R2、字体管理和字帖记录流程。

---

### Task 1: 八行笺竖排坐标与分页

**Files:**
- Create: `apps/web/src/components/zitie/eight-line-layout.ts`
- Create: `apps/web/tests/zitie-eight-line-layout.test.ts`

**Interfaces:**
- Consumes: 输入字符数组、网格坐标、网格宽高、字号和 `"sample" | "alternate"` 模式。
- Produces: `buildEightLinePages(options): EightLinePage[]`，其中每个 placement 包含 `text`/`x`/`y`/`columnFromRight`/`rowIndex`。

- [ ] **Step 1: Write the failing coordinate tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildEightLinePages } from "../src/components/zitie/eight-line-layout";

const baseOptions = {
  chars: Array.from("天地玄黄宇宙洪荒"),
  fontSize: 24,
  gridHeight: 120,
  gridWidth: 400,
  gridX: 40,
  gridY: 80,
  mode: "sample" as const
};

test("八行笺在最右列从上到下排列后转入左侧列", () => {
  const [page] = buildEightLinePages(baseOptions);

  assert.equal(page.items[0]?.columnFromRight, 0);
  assert.equal(page.items[0]?.rowIndex, 0);
  assert.equal(page.items[1]?.columnFromRight, 0);
  assert.ok((page.items[1]?.y ?? 0) > (page.items[0]?.y ?? 0));
  assert.ok(page.items.some((item) => item.columnFromRight === 1));
  assert.ok((page.items.find((item) => item.columnFromRight === 1)?.x ?? 0) < (page.items[0]?.x ?? 0));
});

test("八行笺隔行只使用从右数奇数列", () => {
  const pages = buildEightLinePages({ ...baseOptions, chars: Array.from("天".repeat(80)), mode: "alternate" });
  const usedColumns = new Set(pages[0]?.items.map((item) => item.columnFromRight));

  assert.deepEqual([...usedColumns], [0, 2, 4, 6]);
});

test("八行笺写满可用列后自动分页且不丢字", () => {
  const chars = Array.from("字".repeat(200));
  const pages = buildEightLinePages({ ...baseOptions, chars });

  assert.ok(pages.length > 1);
  assert.equal(pages.flatMap((page) => page.items).map((item) => item.text).join(""), chars.join(""));
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd apps/web && node --import tsx --test tests/zitie-eight-line-layout.test.ts`

Expected: FAIL because `eight-line-layout.ts` does not exist.

- [ ] **Step 3: Implement the pure layout function**

```ts
export type EightLineMode = "sample" | "alternate";

export interface EightLinePlacement {
  columnFromRight: number;
  rowIndex: number;
  text: string;
  x: number;
  y: number;
}

export interface EightLinePage {
  columnWidth: number;
  effectiveFontSize: number;
  items: EightLinePlacement[];
  rowsPerColumn: number;
  verticalAdvance: number;
}

export function buildEightLinePages(options: {
  chars: string[];
  fontSize: number;
  gridHeight: number;
  gridWidth: number;
  gridX: number;
  gridY: number;
  mode: EightLineMode;
}): EightLinePage[] {
  const columnWidth = options.gridWidth / 8;
  const effectiveFontSize = Math.min(options.fontSize, columnWidth * 0.78);
  const verticalAdvance = Math.max(effectiveFontSize + 4, effectiveFontSize * 1.25);
  const rowsPerColumn = Math.max(1, Math.floor(options.gridHeight / verticalAdvance));
  const columns = options.mode === "alternate" ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5, 6, 7];
  const pageCapacity = rowsPerColumn * columns.length;
  const pages: EightLinePage[] = [];

  for (let start = 0; start < options.chars.length; start += pageCapacity) {
    const pageChars = options.chars.slice(start, start + pageCapacity);
    pages.push({
      columnWidth,
      effectiveFontSize,
      items: pageChars.map((text, index) => {
        const columnIndex = Math.floor(index / rowsPerColumn);
        const rowIndex = index % rowsPerColumn;
        const columnFromRight = columns[columnIndex] ?? columns.at(-1) ?? 0;
        return {
          columnFromRight,
          rowIndex,
          text,
          x: options.gridX + (7 - columnFromRight) * columnWidth,
          y: options.gridY + rowIndex * verticalAdvance
        };
      }),
      rowsPerColumn,
      verticalAdvance
    });
  }

  return pages.length > 0
    ? pages
    : [{ columnWidth, effectiveFontSize, items: [], rowsPerColumn, verticalAdvance }];
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `cd apps/web && node --import tsx --test tests/zitie-eight-line-layout.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/web/src/components/zitie/eight-line-layout.ts apps/web/tests/zitie-eight-line-layout.test.ts
git commit -m "feat(zitie): add eight-line vertical layout"
```

### Task 2: 八列 SVG 网格的统一渲染

**Files:**
- Modify: `apps/api-core/src/render-engine/core/layout-parser.ts`
- Modify: `apps/api-core/src/render-engine/svg/grid-renderer.ts`
- Modify: `apps/api-core/tests/copybook-render-text.test.ts`
- Modify: `apps/web/src/components/zitie/zitie-generator.tsx`

**Interfaces:**
- Consumes: `CopybookGrid.variant = "eight-line"`，`cols = 8`，`rows = 1`，`cellWidth` 为列宽，`cellHeight` 为网格全高。
- Produces: 前端 SVG 和 API SVG 中均包含一个 `rect` 外框与 7 条竖线。

- [ ] **Step 1: Add a failing API SVG test**

```ts
test("八行笺输出八列竖格且外框比内线粗", () => {
  const document = parseLayoutDocument({
    page: { width: 595, height: 842, margin: 40 },
    grid: {
      type: "fang",
      variant: "eight-line",
      cell: 64.375,
      cellWidth: 64.375,
      cellHeight: 650,
      rowGap: 0,
      rows: 1,
      cols: 8,
      x: 40,
      y: 110
    },
    content: [{ text: "天", x: 490.625, y: 110, repeat: 1, style: "trace", align: "center", darkExampleCount: 1, traceExampleCount: 0 }],
    style: { strokeColor: "#C7472F", guideColor: "#E6A18F", textColor: "#C7472F", traceColor: "#E6A18F", font: "serif", fontSize: 24 }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /<rect x="40" y="110" width="515" height="650"[^>]*stroke-width="1\.4"/);
  assert.equal((svg.match(/stroke-width="0\.7"/g) ?? []).length, 7);
});
```

- [ ] **Step 2: Run the API test and verify RED**

Run: `cd apps/api-core && node --import tsx --test tests/copybook-render-text.test.ts`

Expected: FAIL because the parser drops `eight-line` and the renderer emits ordinary cell rectangles.

- [ ] **Step 3: Extend the parser and API grid renderer**

Update the variant union and whitelist:

```ts
export type CopybookGridVariant = "ruled" | "calligraphy" | "pinyin-tian" | "eight-line";
const gridVariants = new Set<CopybookGridVariant>(["ruled", "calligraphy", "pinyin-tian", "eight-line"]);
```

Add a dedicated renderer before the generic cell loop:

```ts
if (grid.variant === "eight-line") {
  return `<g data-layer="grid" data-width="${width}" data-height="${height}">${renderEightLineGrid(layout)}</g>`;
}
```

`renderEightLineGrid()` must emit a `1.4` outer rectangle and exactly seven `0.7` vertical lines using `style.strokeColor`.

- [ ] **Step 4: Mirror the same grid output in the web SVG renderer**

Add `"eight-line"` to the web layout variant union and route `renderGrid()` to a web `renderEightLineGrid()` using the same coordinates and stroke widths as the API renderer.

- [ ] **Step 5: Run the API test and type checks**

Run: `cd apps/api-core && node --import tsx --test tests/copybook-render-text.test.ts`

Expected: all copybook render tests PASS.

Run: `pnpm --filter @xueleai/api-core typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/api-core/src/render-engine/core/layout-parser.ts apps/api-core/src/render-engine/svg/grid-renderer.ts apps/api-core/tests/copybook-render-text.test.ts apps/web/src/components/zitie/zitie-generator.tsx
git commit -m "feat(zitie): render eight-line copybook grid"
```

### Task 3: 全局示范模式与八行笺模板接入

**Files:**
- Create: `apps/web/src/components/zitie/practice-mode.ts`
- Create: `apps/web/tests/zitie-practice-mode.test.ts`
- Modify: `apps/web/src/components/zitie/zitie-generator.tsx`
- Modify: `apps/api-core/tests/copybook-render-text.test.ts`

**Interfaces:**
- Consumes: `PracticeLineMode = "sample" | "word" | "alternate" | "letter"`、当前模板 ID 和描写数量。
- Produces: `practiceModesForTemplate(templateId)` 和 `exampleCountsForMode(mode, repeat)`；八行笺 Layout JSON 使用 Task 1 坐标与 Task 2 grid variant。

- [ ] **Step 1: Write failing practice-mode tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { exampleCountsForMode, practiceModesForTemplate } from "../src/components/zitie/practice-mode";

test("示范模式只生成一个深色示范字", () => {
  assert.deepEqual(exampleCountsForMode("sample", 6), { darkExampleCount: 1, traceExampleCount: 0 });
});

test("八行笺仅提供示范和隔行", () => {
  assert.deepEqual(practiceModesForTemplate("eight-line"), ["sample", "alternate"]);
});

test("其他模板在原排版前增加示范", () => {
  assert.deepEqual(practiceModesForTemplate("english"), ["sample", "word", "alternate", "letter"]);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd apps/web && node --import tsx --test tests/zitie-practice-mode.test.ts`

Expected: FAIL because `practice-mode.ts` does not exist.

- [ ] **Step 3: Implement the practice-mode helpers**

```ts
export type PracticeLineMode = "sample" | "word" | "alternate" | "letter";

const allModes: PracticeLineMode[] = ["sample", "word", "alternate", "letter"];

export function practiceModesForTemplate(templateId: string): PracticeLineMode[] {
  return templateId === "eight-line" ? ["sample", "alternate"] : allModes;
}

export function exampleCountsForMode(mode: PracticeLineMode, repeat: number) {
  return {
    darkExampleCount: 1,
    traceExampleCount: mode === "sample" || mode === "alternate" ? 0 : Math.max(0, repeat)
  };
}
```

- [ ] **Step 4: Add the template and mode UI**

In `zitie-generator.tsx`:

- import `PracticeLineMode`, `practiceModesForTemplate`, and `exampleCountsForMode`;
- add the label `sample: "示范"`;
- add template ID `eight-line`, title `八行笺`, description `传统竖排笺纸`, default text `天地玄黄宇宙洪荒日月盈昴辰宿列张`, default mode `sample`, grid type `fang`;
- add `eight-line` to `fontUploadTemplates` and the Chinese-font suitable-template predicate;
- render the mode `<option>` list from `practiceModesForTemplate(activeTemplateId)`;
- disable difficulty when mode is `sample` or `alternate`, displaying `描写0个`;
- when switching templates, set repeat to 0 for `sample` and `alternate`;
- if a stale `word` or `letter` mode reaches the eight-line template, normalize it to `sample`.

- [ ] **Step 5: Build eight-line pages into Layout JSON**

Before existing template branches, detect:

```ts
const isEightLinePaper = templateId === "eight-line" && inputMode === "copybook";
```

Use the worksheet-adjusted grid bounds and Task 1 helper:

```ts
const availableGridHeight = Math.max(
  1,
  pageInfo.height - pageInfo.margin - worksheetBottomReserve - gridY
);
const eightLinePages = buildEightLinePages({
  chars,
  fontSize,
  gridHeight: availableGridHeight,
  gridWidth: contentWidth,
  gridX: pageInfo.margin,
  gridY,
  mode: practiceLineMode === "alternate" ? "alternate" : "sample"
});
```

Each content item must use:

```ts
{
  text: item.text,
  pinyin: "",
  x: item.x,
  y: item.y,
  repeat: 1,
  style: contentStyle,
  align: "center",
  darkExampleCount: 1,
  traceExampleCount: 0,
  verticalAlign: "middle",
  contentCellHeight: eightLinePage.verticalAdvance,
  maxFontSize: eightLinePage.effectiveFontSize,
  textOffsetY: contentOffsetY
}
```

The page grid must use `variant: "eight-line"`, `rows: 1`, `cols: 8`, `cellWidth: contentWidth / 8`, and `cellHeight: availableGridHeight`.

- [ ] **Step 6: Apply sample behavior to every existing template branch**

Add `isSamplePractice = practiceLineMode === "sample"`. Keep each template's existing unit and grid geometry, but force every sample item to `darkExampleCount: 1`, `traceExampleCount: 0`, and at least one rendered slot. For stroke-practice rows set `practice.traceExampleCount = 0`; for pinyin, English, number, essay, ruled, calligraphy, hui, and generic content, apply the same segmented-example fields so `repeat = 0` never hides the sample text.

- [ ] **Step 7: Run focused web tests and type checks**

Run: `cd apps/web && node --import tsx --test tests/zitie-practice-mode.test.ts tests/zitie-eight-line-layout.test.ts tests/zitie-ruled-paper-wrap.test.ts`

Expected: all tests PASS.

Run: `pnpm --filter @xueleai/web typecheck`

Expected: exit 0.

Run: `pnpm --filter @xueleai/api-core typecheck`

Expected: exit 0.

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/web/src/components/zitie/practice-mode.ts apps/web/tests/zitie-practice-mode.test.ts apps/web/src/components/zitie/zitie-generator.tsx apps/api-core/tests/copybook-render-text.test.ts
git commit -m "feat(zitie): add sample mode and eight-line template"
```

### Task 4: Browser and PDF-path verification

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Consumes: running `/zitie` page at `http://localhost:3321/zitie` and the existing `/render/svg` / `/render/pdf` flow.
- Produces: verified desktop UI, multi-page SVG preview, and API SVG/PDF-compatible layout.

- [ ] **Step 1: Run the complete focused verification set**

Run: `cd apps/web && node --import tsx --test tests/zitie-practice-mode.test.ts tests/zitie-eight-line-layout.test.ts tests/zitie-ruled-paper-wrap.test.ts`

Run: `cd apps/api-core && node --import tsx --test tests/copybook-render-text.test.ts`

Run: `pnpm --filter @xueleai/web typecheck`

Run: `pnpm --filter @xueleai/api-core typecheck`

Expected: every command exits 0.

- [ ] **Step 2: Verify the visible page in the in-app browser**

At `http://localhost:3321/zitie`:

1. Open `更多模板` if the card does not fit the common-template area, then select `八行笺`.
2. Confirm `排版` defaults to `示范` and only shows `示范` / `隔行`.
3. Confirm the preview has 8 vertical columns, a visibly thicker outer border, no horizontal grid lines, and text starts in the upper-right column.
4. Confirm characters proceed downward, then continue in the adjacent left column.
5. Switch to `隔行` and confirm content uses alternating columns with blank writing columns between them.
6. Select another template and confirm `示范` is available and renders no trace copies.
7. Enter enough content to create multiple pages and confirm all pages appear in preview.

- [ ] **Step 3: Verify SVG structure and PDF path**

Generate an eight-line copybook and inspect the returned SVG:

- `viewBox` matches the selected paper size;
- grid contains one outer rectangle and seven vertical separator lines;
- no `textLength` or `lengthAdjust` attributes;
- all content coordinates remain inside the grid bounds;
- multi-page layout is accepted by `/render/pdf` and returns a PDF binary stream.

- [ ] **Step 4: Commit any verification-only fix**

Only when Step 2 or Step 3 required a code correction:

```bash
git add apps/web/src/components/zitie apps/web/tests apps/api-core/src/render-engine apps/api-core/tests/copybook-render-text.test.ts
git commit -m "fix(zitie): finalize eight-line template rendering"
```
