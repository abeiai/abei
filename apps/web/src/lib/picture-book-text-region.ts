import type { PictureBookAnnotationShape, PictureBookTextBox } from "./picture-book-text-layout";

export type Point = { x: number; y: number };
export type CanvasSize = { width: number; height: number };
const turn = 2 * Math.PI;

export function pictureBookRegionVerticalInset(shape: PictureBookTextBox["shape"]) {
  return shape === "cloud" ? .2 : shape === "ellipse" ? .16 : 0;
}

export function regionPosition(box: PictureBookTextBox, point: Point): Partial<PictureBookTextBox> {
  if (!box.tail) return point;
  const unit = (value: number) => Math.max(0, Math.min(1, value));
  return { ...point, tail: { x: unit(box.tail.x + point.x - box.x), y: unit(box.tail.y + point.y - box.y) } };
}

function bodyPoints(width: number, height: number, shape: PictureBookAnnotationShape, corner: number): Point[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  if (shape !== "rounded") {
    return Array.from({ length: 120 }, (_, i) => {
      const angle = i * turn / 120;
      const x = Math.cos(angle) * halfWidth;
      const y = Math.sin(angle) * halfHeight;
      if (shape === "ellipse") return { x, y };
      const phase = ((i / 15 + .5) % 1 - .5) * 2;
      const lobe = Math.sqrt(1 - phase * phase);
      const radius = Math.hypot(x, y);
      const swell = 1 - (1 - lobe) * Math.min(width, height) * .14 / radius;
      return { x: x * swell, y: y * swell };
    });
  }
  const radius = Math.max(0, Math.min(corner, halfWidth, halfHeight));
  const corners = [[halfWidth, halfHeight], [-halfWidth, halfHeight], [-halfWidth, -halfHeight], [halfWidth, -halfHeight]] as const;
  return corners.flatMap(([x, y], cornerIndex) => {
    if (!radius) return [{ x, y }];
    return Array.from({ length: 13 }, (_, step) => {
      const angle = (cornerIndex + step / 12) * Math.PI / 2;
      return { x: x - Math.sign(x) * radius + radius * Math.cos(angle), y: y - Math.sign(y) * radius + radius * Math.sin(angle) };
    });
  });
}

function rayBoundary(points: Point[], angle: number): Point {
  const ray = { x: Math.cos(angle), y: Math.sin(angle) };
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const cross = ray.x * dy - ray.y * dx;
    if (Math.abs(cross) < 1e-7) continue;
    const t = (ray.y * a.x - ray.x * a.y) / cross;
    const distance = (a.x * dy - a.y * dx) / cross;
    if (t >= -1e-7 && t <= 1 + 1e-7 && distance > 0) return { x: ray.x * distance, y: ray.y * distance };
  }
  return { x: 0, y: 0 };
}

export function pictureBookAnnotationPath(width: number, height: number, shape: PictureBookAnnotationShape, radius: number, tip?: Point) {
  const body = bodyPoints(width, height, shape, radius);
  const local = (point: Point) => `${(point.x + width / 2).toFixed(2)} ${(point.y + height / 2).toFixed(2)}`;
  const toPath = (points: Point[]) => `M ${points.map(local).join(" L ")} Z`;
  if (!tip) return toPath(body);
  const tail = { x: tip.x - width / 2, y: tip.y - height / 2 };
  const angle = Math.atan2(tail.y, tail.x);
  const middle = rayBoundary(body, angle);
  if (Math.hypot(tail.x, tail.y) <= Math.hypot(middle.x, middle.y) + 1) return toPath(body);

  // Replace a small arc of the body with the two sides of the tail. A single path keeps the fill and border continuous.
  const edge = Math.max(.10, Math.min(.33, Math.min(width, height) * .15 / Math.hypot(middle.x, middle.y)));
  const start = angle + edge;
  const angleAfter = (point: Point) => (Math.atan2(point.y, point.x) - start + 2 * turn) % turn;
  const outline = body.map(point => ({ point, angle: angleAfter(point) }))
    .filter(item => item.angle < turn - 2 * edge).sort((a, b) => a.angle - b.angle).map(item => item.point);
  return toPath([rayBoundary(body, start), ...outline, rayBoundary(body, angle - edge), tail]);
}
