import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { SaveCourseDto } from "../src/courses/dto/course.dto.js";

function coursePayload(itemCount: number) {
  return {
    name: "二百课件课程",
    coverMediaId: "cover-1",
    summary: "验证单课程课件容量。",
    tags: ["容量测试"],
    items: Array.from({ length: itemCount }, (_, index) => ({
      materialType: "VIDEO_GUIDE",
      materialId: `video-${index + 1}`,
      displayName: `课件 ${index + 1}`
    }))
  };
}

test("课程保存接口允许二百个课件并拒绝第二百零一个", async () => {
  const acceptedErrors = await validate(plainToInstance(SaveCourseDto, coursePayload(200)));
  const rejectedErrors = await validate(plainToInstance(SaveCourseDto, coursePayload(201)));

  assert.deepEqual(acceptedErrors, []);
  assert.equal(rejectedErrors.some((error) => error.property === "items"), true);
  assert.equal(
    rejectedErrors.some((error) => error.constraints?.arrayMaxSize === "单个专辑最多添加 200 个课件"),
    true
  );
});
