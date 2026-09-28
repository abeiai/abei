import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateStudentPhotoDto } from "../src/ai/dto/create-student-photo.dto.js";

const valid = {
  modelInstanceId: "image-model",
  sourceImage: { name: "学生.png", type: "image", mimeType: "image/png", size: 100, dataUrl: "data:image/png;base64,AAAA" },
  outfit: "NAVY_SUIT",
  widthMm: 22,
  heightMm: 32,
  backgroundColor: "#ffffff",
  optimizations: ["smoothSkin"]
};

test("学生证照参数接受预设尺寸和优化项", () => {
  assert.equal(validateSync(plainToInstance(CreateStudentPhotoDto, valid)).length, 0);
  assert.equal(validateSync(plainToInstance(CreateStudentPhotoDto, {
    ...valid, clientRequestId: "c156aa65-32e6-4c3f-a4cb-9a841530437e"
  })).length, 0);
  assert.equal(validateSync(plainToInstance(CreateStudentPhotoDto, {
    ...valid, modelInstanceId: undefined, naturalRetouchStrength: 20, blemishRemovalStrength: 0
  })).length, 0);
});

test("学生证照拒绝无效尺寸、背景与优化项", () => {
  const dto = plainToInstance(CreateStudentPhotoDto, {
    ...valid, widthMm: 12, backgroundColor: "red", optimizations: "smoothSkin"
  });
  assert.ok(validateSync(dto).length >= 3);
  assert.ok(validateSync(plainToInstance(CreateStudentPhotoDto, {
    ...valid, naturalRetouchStrength: 120, blemishRemovalStrength: -1
  })).length >= 2);
  assert.ok(validateSync(plainToInstance(CreateStudentPhotoDto, {
    ...valid, clientRequestId: "not-a-request-id"
  })).length >= 1);
});
