import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseLayoutDocument } from "../src/render-engine/core/layout-parser.js";
import { registerCopybookFonts, resolvePdfFontFamily } from "../src/render-engine/fonts/font-loader.js";
import { prepareSvgTextForPdf, splitPdfTextRuns } from "../src/render-engine/pdf/svg-to-pdf.js";
import { buildCopybookSvg } from "../src/render-engine/svg/svg-builder.js";

test("姓名贴循环铺页并按字段横线规则渲染边框与背景", () => {
  const background = "data:image/png;base64,iVBORw0KGgo=";
  const document = parseLayoutDocument({
    page: { width: 595, height: 842, margin: 40 },
    grid: {
      type: "fang",
      visible: false,
      cell: 127,
      cellWidth: 241,
      cellHeight: 127,
      rowGap: 8,
      rows: 2,
      cols: 2,
      x: 52,
      y: 290,
    },
    content: [],
    nameLabelSheet: {
      x: 52,
      y: 290,
      labelWidth: 241,
      labelHeight: 127,
      horizontalGap: 8,
      verticalGap: 8,
      rows: 2,
      columns: 2,
      padding: 12,
      horizontalPadding: 20,
      lineHeight: 1.8,
      textLayout: "auto",
      showUnderline: true,
      labels: [
        { lines: ["姓名：张三", "一班"] },
        { lines: ["姓名：李四", "二班"] },
      ],
      backgroundImage: {
        src: background,
        name: "background.png",
      },
      border: {
        visible: true,
        style: "double",
        color: "#22C55E",
        width: 3,
        radius: 12,
        innerColor: "#111827",
        innerWidth: 0.8,
        innerRadius: 5,
        innerInset: 7,
      },
    },
    style: {
      strokeColor: "#22C55E",
      guideColor: "#D1D5DB",
      textColor: "#111827",
      traceColor: "#9CA3AF",
      font: "serif",
      fontSize: 20,
    },
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.equal((svg.match(/data-role="name-label"/g) ?? []).length, 4);
  assert.equal((svg.match(/>张三<\/text>/g) ?? []).length, 2);
  assert.equal((svg.match(/>李四<\/text>/g) ?? []).length, 2);
  assert.equal((svg.match(/data-role="name-label-background"/g) ?? []).length, 4);
  assert.match(svg, /data-role="name-label-field"[^>]*>姓名：<\/text>/);
  assert.match(svg, /data-role="name-label-underline"/);
  assert.match(svg, /stroke="#22C55E" stroke-width="3"/);
  assert.match(svg, /stroke="#111827" stroke-width="0\.8"/);
  assert.match(svg, /rx="4\.6" fill="none" stroke="#111827"/);
  assert.match(svg, /data-role="name-label"[^>]*data-line-height="1\.8"/);
  assert.match(svg, /data-role="name-label-field"[^>]*y="341\.9"[^>]*>姓名：<\/text>/);
  assert.match(svg, /data-role="name-label-field"[^>]*x="72"[^>]*>姓名：<\/text>/);
  assert.match(svg, /<text[^>]*y="377\.9"[^>]*>一班<\/text>/);

  for (const lineHeight of [0.8, 1.8, 2.5]) {
    const page = structuredClone(document.pages[0]);
    page.nameLabelSheet!.lineHeight = lineHeight;
    const candidateSvg = buildCopybookSvg(page);
    const firstLabel = candidateSvg
      .split('data-label-index="0"')[1]
      ?.split('data-label-index="1"')[0] ?? "";
    const textMetrics = Array.from(firstLabel.matchAll(/<text[^>]*y="([^"]+)"[^>]*font-size="([^"]+)"/g))
      .map((match) => ({ baseline: Number(match[1]), fontSize: Number(match[2]) }));
    const uniqueBaselines = Array.from(new Set(textMetrics.map(({ baseline }) => baseline)));
    const fontSize = textMetrics[0]?.fontSize ?? 0;
    const visualTop = (uniqueBaselines[0] ?? 0) - fontSize * 0.82;
    const visualBottom = (uniqueBaselines.at(-1) ?? 0) + fontSize * 0.18;

    assert.equal(Number(((visualTop + visualBottom) / 2).toFixed(2)), 353.5);
  }
});

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
      y: 110,
    },
    content: [
      {
        text: "天",
        x: 490.625,
        y: 110,
        repeat: 1,
        style: "trace",
        align: "center",
        darkExampleCount: 1,
        traceExampleCount: 0,
      },
    ],
    style: {
      strokeColor: "#C7472F",
      guideColor: "#E6A18F",
      textColor: "#C7472F",
      traceColor: "#E6A18F",
      font: "serif",
      fontSize: 24,
    },
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(
    svg,
    /<rect x="40" y="110" width="515" height="650"[^>]*stroke-width="1\.4"/,
  );
  assert.equal((svg.match(/stroke-width="0\.7"/g) ?? []).length, 7);
});

test("英文描写格使用描写字色且不被示范字色覆盖", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "line",
      cell: 38,
      cellWidth: 128,
      cellHeight: 38,
      rowGap: 16,
      rows: 1,
      cols: 4,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "apple",
        x: 40,
        y: 80,
        repeat: 3,
        style: "trace",
        align: "center",
        darkExampleCount: 1,
        traceExampleCount: 2
      }
    ],
    style: {
      strokeColor: "#2F8F6B",
      guideColor: "#BFE7D2",
      textColor: "#111111",
      traceColor: "#00AAFF",
      font: "serif",
      fontSize: 24
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.equal((svg.match(/fill="#111111" fill-opacity="0\.95"/g) ?? []).length, 1);
  assert.equal((svg.match(/fill="#00AAFF" fill-opacity="1"/g) ?? []).length, 2);
  assert.equal((svg.match(/fill="#111111" fill-opacity="0\.95"[^>]*>apple<\/text>/g) ?? []).length, 1);
});

test("数字书写支持把数字定位到田字格左侧两个小格", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "tianzi",
      cell: 48,
      cellWidth: 48,
      cellHeight: 48,
      rowGap: 18,
      rows: 1,
      cols: 2,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "8",
        x: 40,
        y: 80,
        repeat: 2,
        style: "trace",
        align: "center",
        darkExampleCount: 1,
        traceExampleCount: 1,
        textOffsetX: -12,
        verticalAlign: "middle",
        maxFontSize: 30
      }
    ],
    style: {
      strokeColor: "#111111",
      guideColor: "#999999",
      textColor: "#222222",
      traceColor: "#777777",
      font: "serif",
      fontSize: 44
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /<text x="52" y="104" dy="13\.8" font-size="30"[^>]*fill="#222222"[^>]*>8<\/text>/);
  assert.match(svg, /<text x="100" y="104" dy="13\.8" font-size="30"[^>]*fill="#777777"[^>]*>8<\/text>/);
});

test("横线纸文本保留全角空格并使用纯横线网格", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "line",
      variant: "ruled",
      cell: 28,
      cellWidth: 515,
      cellHeight: 28,
      rowGap: 0,
      rows: 2,
      cols: 1,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "　　夏天",
        x: 44,
        y: 80,
        repeat: 1,
        style: "trace",
        align: "left",
        darkExampleCount: 1,
        traceExampleCount: 0,
        preserveSpace: true
      }
    ],
    style: {
      strokeColor: "#6666FF",
      guideColor: "#BFE7D2",
      textColor: "#111111",
      traceColor: "#00AAFF",
      font: "serif",
      fontSize: 20
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /<line x1="40" y1="108" x2="555" y2="108" stroke="#6666FF"/);
  assert.doesNotMatch(svg, /<rect x="40" y="80" width="515" height="28" fill="none" stroke="#6666FF"/);
  assert.match(svg, /xml:space="preserve"[^>]*>\u3000\u3000夏天<\/text>/u);
});

test("横线纸约束文本输出裁剪框且不改变字体比例", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "line",
      variant: "ruled",
      cell: 28,
      cellWidth: 515,
      cellHeight: 28,
      rowGap: 0,
      rows: 1,
      cols: 1,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "　　夏天的飞鸟",
        x: 44,
        y: 80,
        repeat: 1,
        style: "trace",
        align: "left",
        darkExampleCount: 1,
        traceExampleCount: 0,
        preserveSpace: true,
        fitWidth: 180,
        letterSpacing: -1,
        clipId: "ruled-line-0-0",
        clipX: 40,
        clipY: 80,
        clipWidth: 515,
        clipHeight: 28
      }
    ],
    style: {
      strokeColor: "#6666FF",
      guideColor: "#BFE7D2",
      textColor: "#111111",
      traceColor: "#00AAFF",
      font: "serif",
      fontSize: 20
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /<clipPath id="zitie-[a-z0-9]+"><rect x="40" y="80" width="515" height="28"\/><\/clipPath>/);
  assert.match(svg, /clip-path="url\(#zitie-[a-z0-9]+\)"/);
  assert.match(svg, /xml:space="preserve"/);
  assert.match(svg, /letter-spacing="-1"/);
  assert.doesNotMatch(svg, /textLength=/);
  assert.doesNotMatch(svg, /lengthAdjust=/);
});

test("重复描写文字的裁剪框跟随所在格移动", () => {
  const document = parseLayoutDocument({
    page: { width: 595, height: 842, margin: 40 },
    grid: {
      type: "tianzi",
      cell: 40,
      cellWidth: 40,
      cellHeight: 40,
      rowGap: 12,
      rows: 1,
      cols: 4,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "8",
        x: 40,
        y: 80,
        repeat: 2,
        style: "trace",
        align: "center",
        darkExampleCount: 1,
        traceExampleCount: 1,
        textOffsetX: -10,
        verticalAlign: "middle",
        clipId: "number-cell-0-0",
        clipX: 40,
        clipY: 80,
        clipWidth: 20,
        clipHeight: 40
      }
    ],
    style: {
      strokeColor: "#22C55E",
      guideColor: "#BFE7D2",
      textColor: "#111111",
      traceColor: "#FCA5A5",
      font: "serif",
      fontSize: 40
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /<rect x="40" y="80" width="20" height="40"\/>/);
  assert.match(svg, /<rect x="80" y="80" width="20" height="40"\/>/);
});

test("横线纸文本以底线为基准且最大字号可达到行高", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "line",
      variant: "ruled",
      cell: 28,
      cellWidth: 515,
      cellHeight: 28,
      rowGap: 0,
      rows: 1,
      cols: 1,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "夏天",
        x: 44,
        y: 80,
        repeat: 1,
        style: "trace",
        align: "left",
        darkExampleCount: 1,
        traceExampleCount: 0,
        textOffsetY: 28 / 3,
        maxFontSize: 28
      }
    ],
    style: {
      strokeColor: "#2F8F6B",
      guideColor: "#BFE7D2",
      textColor: "#EF1D28",
      traceColor: "#FFB6BD",
      font: "serif",
      fontSize: 60
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /<text x="44" y="108" font-size="28"[^>]*>夏天<\/text>/);
});

test("作文纸文本以格子底线为基准且最大字号可达到格高", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "fang",
      cell: 30,
      cellWidth: 30,
      cellHeight: 30,
      rowGap: 6,
      rows: 1,
      cols: 1,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "夏",
        x: 40,
        y: 80,
        repeat: 1,
        style: "trace",
        darkExampleCount: 1,
        traceExampleCount: 0,
        textOffsetY: 10,
        maxFontSize: 30
      }
    ],
    style: {
      strokeColor: "#2F8F6B",
      guideColor: "#BFE7D2",
      textColor: "#EF1D28",
      traceColor: "#FFB6BD",
      font: "serif",
      fontSize: 60
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /<text x="55" y="110" font-size="30"[^>]*>夏<\/text>/);
});

test("回字格渲染内方框和四角辅助线", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "hui",
      cell: 48,
      cellWidth: 48,
      cellHeight: 48,
      rowGap: 16,
      rows: 1,
      cols: 1,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "春",
        x: 40,
        y: 80,
        repeat: 1,
        style: "trace",
        baselineOffsetRatio: 0.36,
        verticalAlign: "middle"
      }
    ],
    style: {
      strokeColor: "#2AAEAA",
      guideColor: "#9ADBD8",
      textColor: "#111111",
      traceColor: "#FFB6BD",
      font: "serif",
      fontSize: 24
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /<rect x="40" y="80" width="48" height="48" fill="none" stroke="#2AAEAA" stroke-width="0\.82"\/>/);
  assert.match(svg, /<rect x="51\.52" y="91\.52" width="24\.96" height="24\.96" fill="none" stroke="#9ADBD8"/);
  assert.match(svg, /<line x1="40" y1="80" x2="64" y2="104" stroke="#9ADBD8"/);
  assert.match(svg, /<text x="64" y="104" dy="8\.64" font-size="24"/);
});

test("拼音田格渲染拼音四线格并高亮多音字", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "tianzi",
      variant: "pinyin-tian",
      cell: 48,
      cellWidth: 48,
      cellHeight: 66,
      rowGap: 10,
      rows: 1,
      cols: 1,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "重",
        pinyin: "zhòng",
        pinyinOptions: ["zhòng", "chóng"],
        pinyinSelected: false,
        pinyinKey: "0:重",
        pinyinChar: "重",
        pinyinX: 64,
        pinyinY: 93,
        x: 40,
        y: 98,
        repeat: 1,
        style: "trace",
        darkExampleCount: 1,
        traceExampleCount: 0,
        baselineOffsetRatio: 0.36,
        verticalAlign: "middle",
        contentCellHeight: 48
      }
    ],
    style: {
      strokeColor: "#2F8F6B",
      guideColor: "#BFE7D2",
      textColor: "#111111",
      traceColor: "#FFB6BD",
      font: "serif",
      fontSize: 24,
      pinyinFontFamily: "Quicksand",
      pinyinFontUrl: "/api/fonts/files/quicksand.ttf",
      pinyinFontSize: 10
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /<rect x="40" y="80" width="48" height="18" fill="none" stroke="#2F8F6B"/);
  assert.match(svg, /<rect x="40" y="98" width="48" height="48" fill="none" stroke="#2F8F6B"/);
  assert.match(svg, /data-role="stroke-pinyin-picker" data-key="0:重" data-char="重" data-options="zhòng\|chóng"/);
  assert.match(svg, /fill="#FFF3B0" stroke="#FDE047"/);
  assert.match(svg, /@font-face\{font-family:'Quicksand';src:url\('\/api\/fonts\/files\/quicksand\.ttf'\)/);
  assert.match(svg, /font-family="Quicksand, Quicksand, Inter, Arial, sans-serif"/);
  assert.match(svg, /<text x="64" y="122" dy="8\.64" font-size="24"[^>]*>重<\/text>/);
});

test("SVG 预览使用带版本的字体 URL 避免旧字体缓存", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "tianzi",
      visible: false,
      cell: 48,
      cellWidth: 48,
      cellHeight: 48,
      rowGap: 0,
      rows: 1,
      cols: 10,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "天",
        x: 40,
        y: 80,
        repeat: 1,
        style: "trace"
      }
    ],
    style: {
      strokeColor: "#2F8F6B",
      guideColor: "#BFE7D2",
      textColor: "#EF1D28",
      traceColor: "#FFB6BD",
      font: "custom",
      customFontFamily: "默认标准楷体",
      customFontUrl: "/api/fonts/files/default-kai.ttf",
      customFontPreviewUrl: "/api/fonts/files/default-kai.ttf?v=2026-08-01T08%3A31%3A09.741Z",
      fontSize: 24
    }
  });

  const exportSvg = buildCopybookSvg(document.pages[0]);
  const previewSvg = buildCopybookSvg(document.pages[0], { fontUrlMode: "preview" });

  assert.match(exportSvg, /src:url\('\/api\/fonts\/files\/default-kai\.ttf'\)/);
  assert.doesNotMatch(exportSvg, /default-kai\.ttf\?v=/);
  assert.match(previewSvg, /src:url\('\/api\/fonts\/files\/default-kai\.ttf\?v=2026-08-01T08%3A31%3A09\.741Z'\)/);
});

test("生字练习头部按标签和值分别使用指定字体", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "tianzi",
      visible: false,
      cell: 48,
      cellWidth: 48,
      cellHeight: 48,
      rowGap: 0,
      rows: 1,
      cols: 10,
      x: 40,
      y: 80
    },
    content: [],
    strokePracticeRows: [
      {
        type: "stroke-practice-row",
        char: "天",
        pinyin: "tiān",
        pinyinOptions: ["tiān"],
        pinyinSelected: true,
        pinyinKey: "0:天",
        radical: "大",
        strokeCount: 4,
        x: 40,
        y: 80,
        width: 480,
        header: {
          height: 34,
          metaWidth: 192,
          background: "#DDF5E9",
          borderColor: "#2F8F6B"
        },
        practice: {
          cellSize: 48,
          cellCount: 10,
          darkExampleCount: 1,
          traceExampleCount: 1
        },
        style: {
          borderColor: "#2F8F6B",
          guideLineColor: "#BFE7D2",
          darkFill: "#EF1D28",
          traceFill: "#FFB6BD"
        },
        strokeRef: "天"
      }
    ],
    strokeGlyphs: {
      天: {
        character: "天",
        strokes: ["M 100 100 L 900 100", "M 100 400 L 900 400", "M 500 100 L 500 900", "M 500 500 L 900 900"]
      }
    },
    style: {
      strokeColor: "#2F8F6B",
      guideColor: "#BFE7D2",
      textColor: "#111111",
      traceColor: "#FFB6BD",
      font: "serif",
      fontSize: 24,
      pinyinFontFamily: "Quicksand",
      pinyinFontUrl: "/api/fonts/files/quicksand.ttf",
      pinyinFontSize: 10
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /font-family="Source Han Sans SC, Noto Sans CJK SC, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif"[^>]*>拼音<\/text>/);
  assert.match(svg, /<text x="78" y="101" font-size="15" font-family="Quicksand, Quicksand, Inter, Arial, sans-serif" fill="#111827">tiān<\/text>/);
  assert.match(svg, /font-family="Source Han Sans SC, Noto Sans CJK SC, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif"[^>]*>部首<\/text>/);
  assert.match(svg, /font-family="Songti SC, Source Han Serif, serif"[^>]*>大<\/text>/);
  assert.match(svg, /font-family="Source Han Sans SC, Noto Sans CJK SC, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif"[^>]*>笔画<\/text>/);
  assert.match(svg, /font-family="Songti SC, Source Han Serif, serif"[^>]*>4<\/text>/);
  assert.match(svg, /font-family="Source Han Sans SC, Noto Sans CJK SC, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif"[^>]*>笔顺<\/text>/);
});

test("CNS Plus 默认标准楷体没有基础回退时普通汉字使用可显示楷体栈", () => {
  const layout = {
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "tianzi",
      visible: false,
      cell: 48,
      cellWidth: 48,
      cellHeight: 48,
      rowGap: 0,
      rows: 1,
      cols: 10,
      x: 40,
      y: 80
    },
    content: [],
    strokePracticeRows: [
      {
        type: "stroke-practice-row",
        char: "天",
        pinyin: "tiān",
        pinyinOptions: ["tiān"],
        pinyinSelected: true,
        pinyinKey: "0:天",
        radical: "大",
        strokeCount: 4,
        x: 40,
        y: 80,
        width: 480,
        header: {
          height: 34,
          metaWidth: 192,
          background: "#DDF5E9",
          borderColor: "#2F8F6B"
        },
        practice: {
          cellSize: 48,
          cellCount: 10,
          darkExampleCount: 1,
          traceExampleCount: 1
        },
        style: {
          borderColor: "#2F8F6B",
          guideLineColor: "#BFE7D2",
          darkFill: "#EF1D28",
          traceFill: "#FFB6BD"
        },
        strokeRef: "天"
      }
    ],
    style: {
      strokeColor: "#2F8F6B",
      guideColor: "#BFE7D2",
      textColor: "#111111",
      traceColor: "#FFB6BD",
      font: "custom",
      customFontFamily: "默认标准楷体",
      customFontUrl: "/api/fonts/files/font-20260617-cns-zhengkaiti-plus-98-1.ttf",
      fontEncoding: "cns-pua",
      fontSize: 24
    }
  };
  const document = parseLayoutDocument(layout);
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(
    svg,
    /font-family="Kaiti SC, STKaiti, KaiTi, Kaiti, BiauKaiTC, BiauKai, Source Han Serif, Songti SC, serif"[^>]*>天<\/text>/
  );
  assert.doesNotMatch(svg, /font-family="&apos;默认标准楷体&apos;[^"]*"[^>]*>天<\/text>/);
});

test("CNS Plus 默认标准楷体有回退字体时普通汉字优先使用回退字体", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "tianzi",
      visible: false,
      cell: 48,
      cellWidth: 48,
      cellHeight: 48,
      rowGap: 0,
      rows: 1,
      cols: 10,
      x: 40,
      y: 80
    },
    content: [],
    strokePracticeRows: [
      {
        type: "stroke-practice-row",
        char: "天",
        pinyin: "tiān",
        pinyinOptions: ["tiān"],
        pinyinSelected: true,
        pinyinKey: "0:天",
        radical: "大",
        strokeCount: 4,
        x: 40,
        y: 80,
        width: 480,
        header: {
          height: 34,
          metaWidth: 192,
          background: "#DDF5E9",
          borderColor: "#2F8F6B"
        },
        practice: {
          cellSize: 48,
          cellCount: 10,
          darkExampleCount: 1,
          traceExampleCount: 1
        },
        style: {
          borderColor: "#2F8F6B",
          guideLineColor: "#BFE7D2",
          darkFill: "#EF1D28",
          traceFill: "#FFB6BD"
        },
        strokeRef: "天"
      }
    ],
    style: {
      strokeColor: "#2F8F6B",
      guideColor: "#BFE7D2",
      textColor: "#111111",
      traceColor: "#FFB6BD",
      font: "custom",
      customFontFamily: "默认标准楷体",
      customFontUrl: "/api/fonts/files/font-20260617-cns-zhengkaiti-plus-98-1.ttf",
      customFontFallbackFamily: "学乐正楷体",
      customFontFallbackUrl: "/api/fonts/files/font-20260617-hanchan-zhengkaiti.ttf",
      fontEncoding: "cns-pua",
      fontSize: 24
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(
    svg,
    /font-family="&apos;学乐正楷体&apos;, &apos;默认标准楷体&apos;, Kaiti SC, STKaiti, KaiTi, Kaiti, BiauKaiTC, BiauKai, Source Han Serif, Songti SC, serif"[^>]*>天<\/text>/
  );
});

test("CNS Ext-B 默认正楷有回退字体时普通汉字优先使用回退字体", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "tianzi",
      visible: false,
      cell: 48,
      cellWidth: 48,
      cellHeight: 48,
      rowGap: 0,
      rows: 1,
      cols: 10,
      x: 40,
      y: 80
    },
    content: [],
    strokePracticeRows: [
      {
        type: "stroke-practice-row",
        char: "天",
        pinyin: "tiān",
        pinyinOptions: ["tiān"],
        pinyinSelected: true,
        pinyinKey: "0:天",
        radical: "大",
        strokeCount: 4,
        x: 40,
        y: 80,
        width: 480,
        header: {
          height: 34,
          metaWidth: 192,
          background: "#DDF5E9",
          borderColor: "#2F8F6B"
        },
        practice: {
          cellSize: 48,
          cellCount: 10,
          darkExampleCount: 1,
          traceExampleCount: 1
        },
        style: {
          borderColor: "#2F8F6B",
          guideLineColor: "#BFE7D2",
          darkFill: "#EF1D28",
          traceFill: "#FFB6BD"
        },
        strokeRef: "天"
      }
    ],
    style: {
      strokeColor: "#2F8F6B",
      guideColor: "#BFE7D2",
      textColor: "#111111",
      traceColor: "#FFB6BD",
      font: "custom",
      customFontFamily: "默认正楷",
      customFontUrl: "/api/fonts/files/font-20260802-56708335272a77b0.ttf",
      customFontFallbackFamily: "寒蝉正楷体",
      customFontFallbackUrl: "/api/fonts/files/font-20260802-abbfd31b083c1265.ttf",
      fontEncoding: "cns-ext-b",
      fontSize: 24
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(
    svg,
    /font-family="&apos;寒蝉正楷体&apos;, &apos;默认正楷&apos;, Kaiti SC, STKaiti, KaiTi, Kaiti, BiauKaiTC, BiauKai, Source Han Serif, Songti SC, serif"[^>]*>天<\/text>/
  );
});

test("PDF 字体解析优先使用 CNS Plus 的普通汉字回退字体", () => {
  const fontFamily = "'学乐正楷体', '默认标准楷体', Kaiti SC, STKaiti, KaiTi, Kaiti, BiauKaiTC, BiauKai, Source Han Serif, Songti SC, serif";

  assert.equal(
    resolvePdfFontFamily(fontFamily, {
      primaryFamily: "Kaiti",
      embedded: true,
      path: "/tmp/Kaiti.ttf",
      customFonts: [
        {
          family: "学乐正楷体",
          path: "/tmp/xuele-kaiti.ttf"
        },
        {
          family: "默认标准楷体",
          path: "/tmp/default-standard-kaiti.ttf"
        }
      ]
    }),
    "学乐正楷体"
  );
});

test("PDF 遇到主字体缺字时仅将缺失字符切换到备用字体", () => {
  const registration = {
    primaryFamily: "Kaiti" as const,
    embedded: true,
    path: "/tmp/Kaiti.ttf",
    customFonts: [
      {
        family: "方正楷体简体",
        path: "/tmp/fangzheng-kaiti.ttf"
      }
    ]
  };

  assert.deepEqual(
    splitPdfTextRuns(
      "陈一芃",
      "'方正楷体简体', Kaiti SC, STKaiti, KaiTi, Kaiti, Source Han Serif, serif",
      registration,
      (family, character) => family === "方正楷体简体" ? character !== "芃" : true
    ),
    [
      { family: "方正楷体简体", text: "陈一" },
      { family: "Kaiti", text: "芃" }
    ]
  );
});

test("PDF 转换前将缺字文本改为连续的字体回退片段", () => {
  const registration = {
    primaryFamily: "Kaiti" as const,
    embedded: true,
    path: "/tmp/Kaiti.ttf",
    customFonts: [
      {
        family: "方正楷体简体",
        path: "/tmp/fangzheng-kaiti.ttf"
      }
    ]
  };
  const svg = '<svg><text x="10" y="20" text-anchor="middle" font-family="&apos;方正楷体简体&apos;, Kaiti">陈一芃</text></svg>';

  assert.equal(
    prepareSvgTextForPdf(
      svg,
      registration,
      (family, character) => family === "方正楷体简体" ? character !== "芃" : true
    ),
    '<svg><text x="10" y="20" text-anchor="middle" font-family="&apos;方正楷体简体&apos;, Kaiti"><tspan font-family="方正楷体简体">陈一</tspan><tspan font-family="Kaiti">芃</tspan></text></svg>'
  );
});

test("PDF 为固定宋体和黑体注册独立字体文件", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "copybook-fonts-"));
  const primaryPath = join(tempDir, "kaiti.ttf");
  const serifPath = join(tempDir, "NotoSerifCJK-Regular.ttc");
  const sansPath = join(tempDir, "NotoSansCJK-Regular.ttc");
  const previousPrimaryPath = process.env.COPYBOOK_FONT_PATH;
  const previousSerifPath = process.env.COPYBOOK_SERIF_FONT_PATH;
  const previousSansPath = process.env.COPYBOOK_SANS_FONT_PATH;

  writeFileSync(primaryPath, "primary");
  writeFileSync(serifPath, "serif");
  writeFileSync(sansPath, "sans");
  process.env.COPYBOOK_FONT_PATH = primaryPath;
  process.env.COPYBOOK_SERIF_FONT_PATH = serifPath;
  process.env.COPYBOOK_SANS_FONT_PATH = sansPath;

  try {
    const registered: Array<{ name: string; path: string; face?: string }> = [];
    const registration = registerCopybookFonts({
      registerFont(name, path, face) {
        registered.push({ name, path, ...(face ? { face } : {}) });
      }
    });

    assert.deepEqual(registered, [
      { name: "Kaiti", path: primaryPath },
      { name: "Source Han Serif", path: serifPath, face: "NotoSerifCJKsc-Regular" },
      { name: "Songti SC", path: serifPath, face: "NotoSerifCJKsc-Regular" },
      { name: "Source Han Sans", path: sansPath, face: "NotoSansCJKsc-Regular" }
    ]);
    assert.equal(resolvePdfFontFamily("Songti SC, Source Han Serif, serif", registration), "Source Han Serif");
    assert.equal(resolvePdfFontFamily("Source Han Sans SC, Noto Sans CJK SC, sans-serif", registration), "Source Han Sans");
  } finally {
    restoreEnvironmentVariable("COPYBOOK_FONT_PATH", previousPrimaryPath);
    restoreEnvironmentVariable("COPYBOOK_SERIF_FONT_PATH", previousSerifPath);
    restoreEnvironmentVariable("COPYBOOK_SANS_FONT_PATH", previousSansPath);
    rmSync(tempDir, { force: true, recursive: true });
  }
});

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

test("学生信息横线按预留长度或填写内容长度显示", () => {
  const baseLayout = {
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "fang",
      cell: 48,
      cellWidth: 48,
      cellHeight: 48,
      rowGap: 0,
      rows: 1,
      cols: 10,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "字",
        x: 40,
        y: 80,
        repeat: 1,
        style: "trace"
      }
    ],
    style: {
      strokeColor: "#2AAEAA",
      guideColor: "#9ADBD8",
      textColor: "#111111",
      traceColor: "#FFB6BD",
      font: "serif",
      fontSize: 24
    }
  };
  const emptySchoolDocument = parseLayoutDocument({
    ...baseLayout,
    worksheet: {
      studentFields: {
        school: { visible: true, value: "" },
        className: { visible: false, value: "" },
        name: { visible: false, value: "" },
        studentNumber: { visible: false, value: "" }
      }
    }
  });
  const filledSchoolDocument = parseLayoutDocument({
    ...baseLayout,
    worksheet: {
      studentFields: {
        school: { visible: true, value: "一中" },
        className: { visible: false, value: "" },
        name: { visible: false, value: "" },
        studentNumber: { visible: false, value: "" }
      }
    }
  });

  assert.match(buildCopybookSvg(emptySchoolDocument.pages[0]), /<line x1="70" y1="75" x2="170" y2="75"/);
  assert.match(buildCopybookSvg(filledSchoolDocument.pages[0]), /<line x1="70" y1="75" x2="96" y2="75"/);
});

test("学生信息、页脚和页码统一使用思源宋体", () => {
  const document = parseLayoutDocument({
    page: { width: 595, height: 842, margin: 40 },
    grid: {
      type: "fang",
      cell: 48,
      cellWidth: 48,
      cellHeight: 48,
      rowGap: 0,
      rows: 1,
      cols: 10,
      x: 40,
      y: 80
    },
    content: [],
    style: {
      strokeColor: "#2AAEAA",
      guideColor: "#9ADBD8",
      textColor: "#111111",
      traceColor: "#FFB6BD",
      font: "serif",
      fontSize: 24
    },
    worksheet: {
      footer: "好好写字",
      showFooter: true,
      footerStyle: { font: "kaiti", fontSize: 11, color: "#E74C3C" },
      studentFields: {
        school: { visible: true, value: "一中" },
        className: { visible: false, value: "" },
        name: { visible: false, value: "" },
        studentNumber: { visible: false, value: "" }
      },
      pageNumber: { visible: true, position: "bottom-center", text: "1 / 2" }
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /font-family="Songti SC, Source Han Serif, serif"[^>]*xml:space="preserve">学校: <\/text>/);
  assert.doesNotMatch(svg, /学校：/);
  assert.match(svg, /font-family="Songti SC, Source Han Serif, serif"[^>]*>一中<\/text>/);
  assert.match(svg, /font-family="Songti SC, Source Han Serif, serif"[^>]*>- 好好写字 -<\/text>/);
  assert.match(svg, /font-family="Songti SC, Source Han Serif, serif"[^>]*>1 \/ 2<\/text>/);
});

test("书法练习格渲染米字辅助线", () => {
  const document = parseLayoutDocument({
    page: {
      width: 595,
      height: 842,
      margin: 40
    },
    grid: {
      type: "tianzi",
      variant: "calligraphy",
      cell: 120,
      cellWidth: 120,
      cellHeight: 120,
      rowGap: 0,
      rows: 1,
      cols: 1,
      x: 40,
      y: 80
    },
    content: [
      {
        text: "静",
        pinyin: "jìng",
        x: 40,
        y: 80,
        repeat: 1,
        style: "hybrid",
        baselineOffsetRatio: 0.34,
        verticalAlign: "middle"
      }
    ],
    style: {
      strokeColor: "#EF4444",
      guideColor: "#C084FC",
      textColor: "#111111",
      traceColor: "#FFB6BD",
      font: "serif",
      fontSize: 36
    }
  });
  const svg = buildCopybookSvg(document.pages[0]);

  assert.match(svg, /<rect x="40" y="80" width="120" height="120" fill="none" stroke="#EF4444" stroke-width="0\.95"\/>/);
  assert.match(svg, /<line x1="40" y1="80" x2="160" y2="200" stroke="#C084FC" stroke-width="0\.55" stroke-dasharray="2 3"\/>/);
  assert.match(svg, /<line x1="160" y1="80" x2="40" y2="200" stroke="#C084FC" stroke-width="0\.55" stroke-dasharray="2 3"\/>/);
  assert.match(svg, /<text x="100" y="140" dy="12\.24" font-size="36"/);
  assert.doesNotMatch(svg, />jìng<\/text>/);
});
