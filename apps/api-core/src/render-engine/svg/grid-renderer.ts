import { fixedPoint } from "../core/coordinate-system.js";
import type { CopybookPageLayout } from "../core/layout-parser.js";

export function renderGridLayer(layout: CopybookPageLayout) {
  const { grid } = layout;

  if (!grid.visible) {
    return '<g data-layer="grid"></g>';
  }

  const width = fixedPoint(grid.cols * grid.cellWidth);
  const height = fixedPoint(grid.rows * grid.cellHeight + Math.max(0, grid.rows - 1) * grid.rowGap);

  if (grid.variant === "ruled") {
    return `<g data-layer="grid" data-width="${width}" data-height="${height}">${renderRuledGrid(layout)}</g>`;
  }

  if (grid.variant === "eight-line") {
    return `<g data-layer="grid" data-width="${width}" data-height="${height}">${renderEightLineGrid(layout)}</g>`;
  }

  const cells: string[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    const rowY = grid.y + row * (grid.cellHeight + grid.rowGap);

    for (let col = 0; col < grid.cols; col += 1) {
      cells.push(renderCell(layout, grid.x + col * grid.cellWidth, rowY));
    }
  }

  return `<g data-layer="grid" data-width="${width}" data-height="${height}">${cells.join("")}</g>`;
}

function renderEightLineGrid(layout: CopybookPageLayout) {
  const { grid, style } = layout;
  const width = grid.cols * grid.cellWidth;
  const height = grid.rows * grid.cellHeight;
  const lines: string[] = [
    `<rect x="${fixedPoint(grid.x)}" y="${fixedPoint(grid.y)}" width="${fixedPoint(width)}" height="${fixedPoint(height)}" fill="none" stroke="${style.strokeColor}" stroke-width="1.4"/>`,
  ];

  for (let column = 1; column < grid.cols; column += 1) {
    const x = grid.x + column * grid.cellWidth;
    lines.push(
      `<line x1="${fixedPoint(x)}" y1="${fixedPoint(grid.y)}" x2="${fixedPoint(x)}" y2="${fixedPoint(grid.y + height)}" stroke="${style.strokeColor}" stroke-width="0.7"/>`,
    );
  }

  return lines.join("");
}

function renderRuledGrid(layout: CopybookPageLayout) {
  const { grid, style } = layout;
  const width = grid.cols * grid.cellWidth;
  const lines: string[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    const y = grid.y + row * (grid.cellHeight + grid.rowGap) + grid.cellHeight;

    lines.push(
      `<line x1="${fixedPoint(grid.x)}" y1="${fixedPoint(y)}" x2="${fixedPoint(grid.x + width)}" y2="${fixedPoint(y)}" stroke="${style.strokeColor}" stroke-width="0.8"/>`
    );
  }

  return lines.join("");
}

function renderCell(layout: CopybookPageLayout, x: number, y: number) {
  const { grid, style } = layout;
  const cellWidth = grid.cellWidth;
  const cellHeight = grid.cellHeight;
  const rect = `<rect x="${fixedPoint(x)}" y="${fixedPoint(y)}" width="${fixedPoint(cellWidth)}" height="${fixedPoint(cellHeight)}" fill="none" stroke="${style.strokeColor}" stroke-width="0.72"/>`;

  if (grid.variant === "calligraphy") {
    return renderCalligraphyCell(layout, x, y);
  }

  if (grid.variant === "pinyin-tian") {
    return renderPinyinTianCell(layout, x, y);
  }

  if (grid.type === "fang") {
    return rect;
  }

  if (grid.type === "line") {
    return [
      rect,
      `<line x1="${fixedPoint(x)}" y1="${fixedPoint(y + cellHeight * 0.34)}" x2="${fixedPoint(x + cellWidth)}" y2="${fixedPoint(y + cellHeight * 0.34)}" stroke="${style.guideColor}" stroke-width="0.5" stroke-dasharray="1.2 2"/>`,
      `<line x1="${fixedPoint(x)}" y1="${fixedPoint(y + cellHeight * 0.66)}" x2="${fixedPoint(x + cellWidth)}" y2="${fixedPoint(y + cellHeight * 0.66)}" stroke="${style.guideColor}" stroke-width="0.5" stroke-dasharray="1.2 2"/>`
    ].join("");
  }

  if (grid.type === "hui") {
    return renderHuiCell(layout, x, y);
  }

  if (grid.type === "tianzi") {
    return [
      rect,
      `<line x1="${fixedPoint(x)}" y1="${fixedPoint(y + cellHeight / 2)}" x2="${fixedPoint(x + cellWidth)}" y2="${fixedPoint(y + cellHeight / 2)}" stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.4 2"/>`,
      `<line x1="${fixedPoint(x + cellWidth / 2)}" y1="${fixedPoint(y)}" x2="${fixedPoint(x + cellWidth / 2)}" y2="${fixedPoint(y + cellHeight)}" stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.4 2"/>`
    ].join("");
  }

  if (grid.type === "rizhi") {
    return [
      rect,
      `<line x1="${fixedPoint(x)}" y1="${fixedPoint(y + cellHeight / 2)}" x2="${fixedPoint(x + cellWidth)}" y2="${fixedPoint(y + cellHeight / 2)}" stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.4 2"/>`
    ].join("");
  }

  const insetX = cellWidth * 0.25;
  const insetY = cellHeight * 0.25;

  return [
    rect,
    `<rect x="${fixedPoint(x + insetX)}" y="${fixedPoint(y + insetY)}" width="${fixedPoint(cellWidth - insetX * 2)}" height="${fixedPoint(cellHeight - insetY * 2)}" fill="none" stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.4 2"/>`
  ].join("");
}

function renderCalligraphyCell(layout: CopybookPageLayout, x: number, y: number) {
  const { grid, style } = layout;
  const cellWidth = grid.cellWidth;
  const cellHeight = grid.cellHeight;
  const midX = x + cellWidth / 2;
  const midY = y + cellHeight / 2;
  const guideStroke = `stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="2 3"`;

  return [
    `<rect x="${fixedPoint(x)}" y="${fixedPoint(y)}" width="${fixedPoint(cellWidth)}" height="${fixedPoint(cellHeight)}" fill="none" stroke="${style.strokeColor}" stroke-width="0.95"/>`,
    `<line x1="${fixedPoint(x)}" y1="${fixedPoint(midY)}" x2="${fixedPoint(x + cellWidth)}" y2="${fixedPoint(midY)}" ${guideStroke}/>`,
    `<line x1="${fixedPoint(midX)}" y1="${fixedPoint(y)}" x2="${fixedPoint(midX)}" y2="${fixedPoint(y + cellHeight)}" ${guideStroke}/>`,
    `<line x1="${fixedPoint(x)}" y1="${fixedPoint(y)}" x2="${fixedPoint(x + cellWidth)}" y2="${fixedPoint(y + cellHeight)}" ${guideStroke}/>`,
    `<line x1="${fixedPoint(x + cellWidth)}" y1="${fixedPoint(y)}" x2="${fixedPoint(x)}" y2="${fixedPoint(y + cellHeight)}" ${guideStroke}/>`
  ].join("");
}

function renderPinyinTianCell(layout: CopybookPageLayout, x: number, y: number) {
  const { grid, style } = layout;
  const cellWidth = grid.cellWidth;
  const pinyinHeight = Math.max(12, grid.cellHeight - grid.cell);
  const charY = y + pinyinHeight;
  const charHeight = grid.cell;
  const midX = x + cellWidth / 2;
  const midY = charY + charHeight / 2;
  const pinyinLineStroke = `stroke="${style.guideColor}" stroke-width="0.45" stroke-dasharray="1.2 2"`;

  return [
    `<rect x="${fixedPoint(x)}" y="${fixedPoint(y)}" width="${fixedPoint(cellWidth)}" height="${fixedPoint(pinyinHeight)}" fill="none" stroke="${style.strokeColor}" stroke-width="0.72"/>`,
    `<line x1="${fixedPoint(x)}" y1="${fixedPoint(y + pinyinHeight * 0.34)}" x2="${fixedPoint(x + cellWidth)}" y2="${fixedPoint(y + pinyinHeight * 0.34)}" ${pinyinLineStroke}/>`,
    `<line x1="${fixedPoint(x)}" y1="${fixedPoint(y + pinyinHeight * 0.66)}" x2="${fixedPoint(x + cellWidth)}" y2="${fixedPoint(y + pinyinHeight * 0.66)}" ${pinyinLineStroke}/>`,
    `<rect x="${fixedPoint(x)}" y="${fixedPoint(charY)}" width="${fixedPoint(cellWidth)}" height="${fixedPoint(charHeight)}" fill="none" stroke="${style.strokeColor}" stroke-width="0.72"/>`,
    `<line x1="${fixedPoint(x)}" y1="${fixedPoint(midY)}" x2="${fixedPoint(x + cellWidth)}" y2="${fixedPoint(midY)}" stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.4 2"/>`,
    `<line x1="${fixedPoint(midX)}" y1="${fixedPoint(charY)}" x2="${fixedPoint(midX)}" y2="${fixedPoint(charY + charHeight)}" stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.4 2"/>`
  ].join("");
}

function renderHuiCell(layout: CopybookPageLayout, x: number, y: number) {
  const { grid, style } = layout;
  const cellWidth = grid.cellWidth;
  const cellHeight = grid.cellHeight;
  const midX = x + cellWidth / 2;
  const midY = y + cellHeight / 2;
  const insetX = cellWidth * 0.24;
  const insetY = cellHeight * 0.24;
  const guideStroke = `stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.5 2"`;

  return [
    `<rect x="${fixedPoint(x)}" y="${fixedPoint(y)}" width="${fixedPoint(cellWidth)}" height="${fixedPoint(cellHeight)}" fill="none" stroke="${style.strokeColor}" stroke-width="0.82"/>`,
    `<line x1="${fixedPoint(midX)}" y1="${fixedPoint(y)}" x2="${fixedPoint(midX)}" y2="${fixedPoint(y + cellHeight)}" ${guideStroke}/>`,
    `<line x1="${fixedPoint(x)}" y1="${fixedPoint(midY)}" x2="${fixedPoint(x + cellWidth)}" y2="${fixedPoint(midY)}" ${guideStroke}/>`,
    `<rect x="${fixedPoint(x + insetX)}" y="${fixedPoint(y + insetY)}" width="${fixedPoint(cellWidth - insetX * 2)}" height="${fixedPoint(cellHeight - insetY * 2)}" fill="none" ${guideStroke}/>`,
    `<line x1="${fixedPoint(x)}" y1="${fixedPoint(y)}" x2="${fixedPoint(midX)}" y2="${fixedPoint(midY)}" ${guideStroke}/>`,
    `<line x1="${fixedPoint(x + cellWidth)}" y1="${fixedPoint(y)}" x2="${fixedPoint(midX)}" y2="${fixedPoint(midY)}" ${guideStroke}/>`,
    `<line x1="${fixedPoint(x)}" y1="${fixedPoint(y + cellHeight)}" x2="${fixedPoint(midX)}" y2="${fixedPoint(midY)}" ${guideStroke}/>`,
    `<line x1="${fixedPoint(x + cellWidth)}" y1="${fixedPoint(y + cellHeight)}" x2="${fixedPoint(midX)}" y2="${fixedPoint(midY)}" ${guideStroke}/>`
  ].join("");
}
