const baselineInsetRatio = 0.16;
const minimumBaselineInset = 1.5;

export function bottomAnchoredTextOffsetY(
  cellHeight: number,
  fontSize: number,
  adjustmentY: number,
) {
  const effectiveFontSize = Math.min(Math.max(0, fontSize), cellHeight);
  const baselineInset = Math.max(
    minimumBaselineInset,
    effectiveFontSize * baselineInsetRatio,
  );

  return cellHeight / 3 - baselineInset + adjustmentY;
}
