interface CopybookPricingPage {
  content?: readonly unknown[];
  grid?: unknown;
  nameLabelSheet?: unknown | null;
  strokeGlyphs?: Record<string, unknown>;
  strokePracticeRows?: readonly unknown[];
  watermark?: unknown | null;
  worksheet?: unknown | null;
}

export function copybookGenerateDialog(isAuthenticated: boolean) {
  return isAuthenticated ? "pricing" : "login";
}

export function copybookPreviewMode(isAuthenticated: boolean) {
  return isAuthenticated ? "remote" : "local";
}

export function copybookPricingForPages(
  pages: readonly CopybookPricingPage[],
  templateId?: string
) {
  const pageCount = Math.max(1, pages.length);
  const hasWatermark = pages.some((page) => Boolean(page.watermark));
  const promotionalFree =
    templateId === "name-label" &&
    pages.length > 0 &&
    pages.every(isPromotionalNameLabelPage);
  const creditsPerPage = promotionalFree ? 0 : hasWatermark ? 5 : 2;
  const credits = pageCount * creditsPerPage;

  return {
    pageCount,
    hasWatermark,
    creditsPerPage,
    credits,
    confirmationMessage: promotionalFree
      ? `本次生成字帖${pageCount}页，活动期间不扣点。`
      : `本次生成${hasWatermark ? "带水印" : ""}字帖${pageCount}页，需消耗${credits}点，确认生成将自动扣除。`
  };
}

function isPromotionalNameLabelPage(page: CopybookPricingPage) {
  const grid = recordValue(page.grid);
  const sheet = recordValue(page.nameLabelSheet);

  return (
    page.watermark == null &&
    grid?.visible === false &&
    Array.isArray(page.content) &&
    page.content.length === 0 &&
    (!page.strokeGlyphs || Object.keys(page.strokeGlyphs).length === 0) &&
    (!page.strokePracticeRows || page.strokePracticeRows.length === 0) &&
    Array.isArray(sheet?.labels) &&
    sheet.labels.length > 0 &&
    isHiddenWorksheet(page.worksheet)
  );
}

function isHiddenWorksheet(value: unknown) {
  if (value == null) {
    return true;
  }

  const worksheet = recordValue(value);
  const fields = recordValue(worksheet?.studentFields);
  const pageNumber = recordValue(worksheet?.pageNumber);

  return (
    worksheet?.showStudentFields === false &&
    worksheet.showTitle !== true &&
    worksheet.showFooter !== true &&
    pageNumber?.visible !== true &&
    [fields?.school, fields?.className, fields?.name, fields?.studentNumber].every(
      (field) => recordValue(field)?.visible !== true
    )
  );
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
