import assert from "node:assert/strict";
import test from "node:test";
import { calculateStudentPhotoCrop, clampStudentPhotoAdjustment } from "../src/lib/student-photo-crop";

test("默认水平位置居中，纵向调节不改变水平位置", () => {
  const top = calculateStudentPhotoCrop(768, 1024, 22, 32, 1.2, -1);
  const bottom = calculateStudentPhotoCrop(768, 1024, 22, 32, 1.2, 1);
  assert.equal(top.left, bottom.left);
  assert.ok(Math.abs(top.left - (768 - top.width) / 2) < 0.001);
  assert.equal(top.top, 0);
  assert.ok(Math.abs(bottom.top + bottom.height - 1024) < 0.001);
});

test("放大后裁剪区域缩小，左右调节仅改变水平位置", () => {
  const normal = calculateStudentPhotoCrop(768, 1024, 35, 45, 1, 0);
  const zoomed = calculateStudentPhotoCrop(768, 1024, 35, 45, 2, 0.5);
  const left = calculateStudentPhotoCrop(768, 1024, 35, 45, 2, 0.5, -1);
  const right = calculateStudentPhotoCrop(768, 1024, 35, 45, 2, 0.5, 1);
  assert.ok(zoomed.width < normal.width);
  assert.ok(zoomed.height < normal.height);
  assert.ok(zoomed.top > 0);
  assert.equal(left.left, 0);
  assert.ok(Math.abs(right.left + right.width - 768) < 0.001);
  assert.equal(left.top, right.top);
  assert.deepEqual(clampStudentPhotoAdjustment(5, -3, 4), { zoom: 2.5, verticalPosition: -1, horizontalPosition: 1 });
});
