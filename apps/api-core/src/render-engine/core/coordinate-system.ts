export const A4_PAGE = {
  width: 595,
  height: 842,
  margin: 40
} as const;

export const PDF_POINT_PER_SVG_UNIT = 1;

export function fixedPoint(value: number) {
  return Number(value.toFixed(3));
}

export function cellTextCenter(x: number, y: number, cell: number) {
  return {
    x: fixedPoint(x + cell / 2),
    y: fixedPoint(y + cell * 2 / 3)
  };
}
