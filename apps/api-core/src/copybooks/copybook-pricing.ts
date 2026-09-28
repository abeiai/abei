import {
  parseLayoutDocument,
  type CopybookPageLayout
} from "../render-engine/core/layout-parser.js";

export const copybookCreditsPerPage = {
  plain: 2,
  watermarked: 5
} as const;

export function calculateCopybookPricing(layout: unknown, templateId?: unknown) {
  const document = parseLayoutDocument(layout);
  const pageCount = document.pages.length;
  const hasWatermark = document.pages.some((page) => page.watermark !== null);
  const promotionalFree =
    templateId === "name-label" &&
    document.pages.every(isPromotionalNameLabelPage);
  const creditsPerPage = promotionalFree
    ? 0
    : hasWatermark
      ? copybookCreditsPerPage.watermarked
      : copybookCreditsPerPage.plain;

  return {
    pageCount,
    hasWatermark,
    creditsPerPage,
    credits: pageCount * creditsPerPage
  };
}

function isPromotionalNameLabelPage(page: CopybookPageLayout) {
  const worksheet = page.worksheet;
  const worksheetHidden =
    worksheet === null ||
    (
      worksheet.showStudentFields === false &&
      worksheet.showTitle === false &&
      worksheet.showFooter === false &&
      worksheet.pageNumber.visible === false &&
      Object.values(worksheet.studentFields).every((field) => field.visible === false)
    );

  return (
    page.watermark === null &&
    page.nameLabelSheet !== null &&
    page.nameLabelSheet.labels.length > 0 &&
    page.grid.visible === false &&
    page.content.length === 0 &&
    Object.keys(page.strokeGlyphs).length === 0 &&
    page.strokePracticeRows.length === 0 &&
    worksheetHidden
  );
}
