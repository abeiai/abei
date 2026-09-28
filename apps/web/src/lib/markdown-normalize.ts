const latexCommandPattern =
  "\\\\(?:frac|dfrac|tfrac|int|sum|prod|sqrt|lim|ln|log|sin|cos|tan|arcsin|arccos|arctan|quad|qquad|neq|leq|geq|approx|cdot|times|partial|nabla|left|right|mathbf|mathrm|operatorname|alpha|beta|gamma|delta|Delta|theta|lambda|mu|pi|sigma|omega)";

const latexCommandRegex = new RegExp(latexCommandPattern);
const latexSyntaxRegex = new RegExp(`${latexCommandPattern}|\\$|\\^|_`);
const bracketLatexPattern = new RegExp(`\\[\\s*([^\\]\\n]*${latexCommandPattern}[^\\]\\n]*)\\s*\\](?!\\()`, "g");
const parenthesizedLatexPattern = new RegExp(
  `(^|[^\\\\])\\(\\s*([^\\)\\n]*${latexCommandPattern}[^\\)\\n]*)\\s*\\)`,
  "g"
);
const contentLabelPattern = "(?:公式|说明|示例|应用场景|定义|解释|推导|结论|注意)";

function repairLatexSyntax(value: string) {
  return value
    .replace(/\\approxx\b/g, "\\approx x")
    .replace(/\\approxy\b/g, "\\approx y")
    .replace(/\\approx([A-Za-z])/g, "\\approx $1")
    .replace(/\\left\$/g, "\\left(")
    .replace(/\\right\$/g, "\\right)")
    .replace(/\\partial(?=[A-Za-z])/g, "\\partial ")
    .replace(/\\nabla(?=[A-Za-z])/g, "\\nabla ")
    .replace(/\\sin\s+([A-Za-z])\s*\\approx\s*([A-Za-z])/g, "\\sin $1 \\approx $2")
    .replace(/\\cos\s+([A-Za-z])\s*\\approx\s*([A-Za-z])/g, "\\cos $1 \\approx $2")
    .replace(/\\tan\s+([A-Za-z])\s*\\approx\s*([A-Za-z])/g, "\\tan $1 \\approx $2")
    .replace(/\{\s*\\partial\s+([^{}]+?)\s*\}/g, "{\\partial $1}")
    .replace(
      /\\frac\{\\partial\s*([A-Za-z_][A-Za-z0-9_]*)\}\{\\partial\s*([A-Za-z_][A-Za-z0-9_]*)\}/g,
      "\\frac{\\partial $1}{\\partial $2}"
    );
}

function normalizeMathFormula(formula: string) {
  return repairLatexSyntax(formula)
    .trim()
    .replace(/^\\\[/, "")
    .replace(/\\\]$/, "")
    .replace(/^\\\(/, "")
    .replace(/\\\)$/, "")
    .replace(/^\[\s*/, "")
    .replace(/\s*\]$/, "")
    .replace(/\$/g, "")
    .replace(/^\\left\s*$/, "")
    .replace(/^\\right\s*$/, "")
    .replace(/\\left\s+([([{|])/g, "\\left$1")
    .replace(/\\right\s+([)\]}|])/g, "\\right$1")
    .replace(/(^|[ ({])sin\s+([A-Za-z])/g, "$1\\sin $2")
    .replace(/(^|[ ({])cos\s+([A-Za-z])/g, "$1\\cos $2")
    .replace(/(^|[ ({])tan\s+([A-Za-z])/g, "$1\\tan $2")
    .replace(/\\nabla\\times/g, "\\nabla \\times")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function displayMathBlock(formula: string) {
  return `\\[\n${normalizeMathFormula(formula)}\n\\]`;
}

function isLikelyStandaloneFormula(line: string) {
  const trimmed = line.trim();

  return (
    latexCommandRegex.test(trimmed) &&
    !/[\u4e00-\u9fff]/.test(trimmed) &&
    !/^\s*(#{1,6}|[-*]\s+|>\s*)/.test(trimmed)
  );
}

function normalizeStandaloneFormulaLines(value: string) {
  let inDisplayMath = false;

  return value
    .split("\n")
    .map((line) => {
      if (/^\s*\\\[\s*$/.test(line)) {
        inDisplayMath = true;
        return line;
      }

      if (/^\s*\\\]\s*$/.test(line)) {
        inDisplayMath = false;
        return line;
      }

      if (inDisplayMath) {
        return line;
      }

      if (!isLikelyStandaloneFormula(line)) {
        return line;
      }

      return displayMathBlock(line);
    })
    .join("\n");
}

function normalizeDollarMath(value: string) {
  return value
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_match, formula: string) => {
      return `\n\n${displayMathBlock(formula)}\n\n`;
    })
    .replace(/\$([^$\n]*\\[A-Za-z][^$\n]*?)\$/g, (_match, formula: string) => {
      return `$${normalizeMathFormula(formula)}$`;
    });
}

function normalizeInlineListLabels(value: string) {
  return value
    .replace(/\s+-\s+\*?([^*\n：:]{1,24})([：:])/g, "\n- $1$2")
    .replace(/(^|\n)(\s*[-*]\s+)\*+([^*\n：:]{1,24})([：:])/g, "$1$2$3$4")
    .replace(/\*\*([^*\n：:]{1,24})\*([：:])/g, "$1$2")
    .replace(/(^|[^*])([^*\s])\*([：:])/g, "$1$2$3");
}

function normalizeMarkdownBoundaries(value: string) {
  return value
    .replace(new RegExp(`([^\\n])\\s*\\*\\*(${contentLabelPattern})\\*\\*([：:])`, "g"), "$1\n\n**$2**$3")
    .replace(new RegExp(`(\\*\\*${contentLabelPattern}\\*\\*[：:])\\s*(?=\\\\\\[)`, "g"), "$1\n\n")
    .replace(new RegExp(`\\\\\\]\\s*(?=\\*\\*${contentLabelPattern}\\*\\*[：:])`, "g"), "\\]\n\n")
    .replace(/([。！？；：:，,）\]])\s*(#{1,6})(?=\s*\S)/g, "$1\n\n$2");
}

function normalizeLabeledFormulaLines(value: string) {
  return value
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*[-*]\s+[^：:\n]{1,24}[：:])\s+(.+)$/);

      if (!match) {
        return line;
      }

      const [, label, formula] = match;

      if (!latexSyntaxRegex.test(formula) || /[\u4e00-\u9fff]/.test(formula)) {
        return line;
      }

      return `${label}\n\n${displayMathBlock(formula)}`;
    })
    .join("\n");
}

function normalizeTextBlock(value: string) {
  const normalizedFormulas = normalizeStandaloneFormulaLines(
    normalizeLabeledFormulaLines(
      normalizeDollarMath(normalizeInlineListLabels(normalizeMarkdownBoundaries(repairLatexSyntax(value)))).replace(
        /\\\[([\s\S]*?)\\\]/g,
        (_match, formula: string) => {
          return `\n\n${displayMathBlock(formula)}\n\n`;
        }
      )
    )
  );

  const normalizedBlock = normalizedFormulas
    .replace(/(^|\n)\s*\$\$\s*([^\n]*\\[A-Za-z]+[^\n]*?)\s*(?:\$\$)?\s*(?=\n|$)/g, (_match, prefix: string, formula: string) => {
      return `${prefix}${displayMathBlock(formula)}`;
    })
    .replace(/(^|\n)\s*([^$\n]*\\[A-Za-z]+[^$\n]*?)\s*\$\$\s*(?=\n|$)/g, (_match, prefix: string, formula: string) => {
      return `${prefix}${displayMathBlock(formula)}`;
    })
    .replace(/([。！？；：:，,）\]])\s*(#{1,6})(?=\s*\S)/g, "$1\n\n$2")
    .replace(/(^|\n)\s*-{3,}\s*(#{1,6})(?=\s*\S)/g, "$1$2")
    .replace(/(^|\n)(#{1,6})\s+#{1,6}\s+/g, "$1$2 ")
    .replace(/(^|\n)(#{1,6})(?!#)(?=\S)/g, "$1$2 ")
    .replace(/(^|\n)(#{1,6}\s+\d+\.)(?=\S)/g, "$1$2 ")
    .replace(/([^\n])\n(#{1,6}\s+)/g, "$1\n\n$2")
    .replace(/(^|\n)-(?=\S)/g, "$1- ")
    .replace(/(^|\n)\*(?!\*)(?=\S)/g, "$1* ")
    .replace(/(^|\n)\s*[-*]\s*(?=\n|$)/g, "$1");

  return normalizeInlineMathOutsideDisplayBlocks(normalizedBlock);
}

function normalizeInlineMathOutsideDisplayBlocks(value: string) {
  const mathBlocks: string[] = [];
  const placeholderPrefix = "__AISAS_MATH_BLOCK_";
  const protectedValue = value.replace(/\\\[[\s\S]*?\\\]/g, (match) => {
    const index = mathBlocks.push(match) - 1;

    return `${placeholderPrefix}${index}__`;
  });

  const transformedValue = protectedValue
    .replace(bracketLatexPattern, (match: string, formula: string, offset: number, source: string) => {
      const normalizedFormula = normalizeMathFormula(formula);

      if (shouldUseDisplayMathForBracketFormula(source, offset, match.length)) {
        return `\n\n${displayMathBlock(normalizedFormula)}\n\n`;
      }

      return `$${normalizedFormula}$`;
    })
    .replace(parenthesizedLatexPattern, (match: string, prefix: string, formula: string, offset: number, source: string) => {
      const parenOffset = offset + prefix.length;
      const beforeParen = source.slice(Math.max(0, parenOffset - 6), parenOffset);

      if (/\\(?:left|right)$/.test(beforeParen)) {
        return match;
      }

      return `${prefix}$${normalizeMathFormula(formula)}$`;
    });

  return transformedValue.replace(new RegExp(`${placeholderPrefix}(\\d+)__`, "g"), (_match, index: string) => {
    return mathBlocks[Number(index)] ?? "";
  });
}

function shouldUseDisplayMathForBracketFormula(source: string, offset: number, matchLength: number) {
  const lineStart = source.lastIndexOf("\n", offset) + 1;
  const nextLineBreak = source.indexOf("\n", offset + matchLength);
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak;
  const before = source.slice(lineStart, offset).trim();
  const after = source.slice(offset + matchLength, lineEnd).trim();

  return before.length === 0 || after.length === 0;
}

export function normalizeMarkdownForIncremark(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const normalized: string[] = [];
  let pendingText: string[] = [];
  let inCodeFence = false;

  function flushText() {
    if (pendingText.length === 0) {
      return;
    }

    normalized.push(normalizeTextBlock(pendingText.join("\n")));
    pendingText = [];
  }

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      flushText();
      normalized.push(line);
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      normalized.push(line);
      continue;
    }

    if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      continue;
    }

    if (/^\s*[-*]\s*$/.test(line)) {
      continue;
    }

    pendingText.push(line);
  }

  flushText();

  return normalized.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
