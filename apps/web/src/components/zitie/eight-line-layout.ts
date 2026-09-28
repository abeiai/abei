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

export interface EightLineLayoutOptions {
  chars: string[];
  fontSize: number;
  gridHeight: number;
  gridWidth: number;
  gridX: number;
  gridY: number;
  mode: EightLineMode;
}

export function tokenizeEightLineInput(value: string): string[] {
  const tokens: string[] = [];
  const chars = Array.from(value.replace(/\r\n?/g, "\n"));

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];

    if (char === " ") {
      let end = index;
      while (chars[end] === " ") end += 1;
      tokens.push(...Array(Math.floor((end - index) / 3)).fill(" "));
      index = end - 1;
      continue;
    }

    if (char === "　") {
      tokens.push(" ");
    } else if (char === "\n") {
      tokens.push("\n");
    } else if (char && !/\s/u.test(char)) {
      tokens.push(char);
    }
  }

  return tokens;
}

export function buildEightLinePages(
  options: EightLineLayoutOptions,
): EightLinePage[] {
  const columnWidth = options.gridWidth / 8;
  const effectiveFontSize = Math.min(options.fontSize, columnWidth * 0.78);
  const verticalAdvance = Math.max(
    effectiveFontSize + 4,
    effectiveFontSize * 1.25,
  );
  const rowsPerColumn = Math.max(
    1,
    Math.floor(options.gridHeight / verticalAdvance),
  );
  const columns =
    options.mode === "alternate"
      ? [0, 2, 4, 6]
      : [0, 1, 2, 3, 4, 5, 6, 7];
  const pageItems: EightLinePlacement[][] = [];
  let pageIndex = 0;
  let columnIndex = 0;
  let rowIndex = 0;
  let autoWrapped = false;

  const advanceColumn = () => {
    columnIndex += 1;
    rowIndex = 0;
    if (columnIndex >= columns.length) {
      pageIndex += 1;
      columnIndex = 0;
    }
  };

  for (const token of options.chars) {
    if (token === "\n") {
      if (!(rowIndex === 0 && autoWrapped)) advanceColumn();
      autoWrapped = false;
      continue;
    }

    pageItems[pageIndex] ??= [];
    if (token !== " " && !/\s/u.test(token)) {
      const columnFromRight = columns[columnIndex] ?? columns.at(-1) ?? 0;
      pageItems[pageIndex].push({
        columnFromRight,
        rowIndex,
        text: token,
        x: options.gridX + (7 - columnFromRight) * columnWidth,
        y: options.gridY + rowIndex * verticalAdvance,
      });
    }

    rowIndex += 1;
    autoWrapped = rowIndex >= rowsPerColumn;
    if (autoWrapped) {
      advanceColumn();
    }
  }

  const pages = pageItems.map((items) => ({
    columnWidth,
    effectiveFontSize,
    items,
    rowsPerColumn,
    verticalAdvance,
  }));

  return pages.length > 0
    ? pages
    : [{ columnWidth, effectiveFontSize, items: [], rowsPerColumn, verticalAdvance }];
}
