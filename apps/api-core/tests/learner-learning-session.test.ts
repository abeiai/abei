import assert from "node:assert/strict";
import test from "node:test";
import { AppException } from "../src/common/app-exception.js";
import { learnerLearningEnabled } from "../src/learner-learning/learner-learning.constants.js";
import {
  accountSubject,
  activeHeartbeat,
  createSessionFixture,
  now,
  subject
} from "./helpers/learner-learning-fixture.js";

test("会话所有权来自 ProfileSubject 且相同时间桶不叠加", async () => {
  const fixture = createSessionFixture();
  const session = await fixture.service.start(
    subject,
    "refresh-1",
    { clientSessionKey: "client-session-key-0001" },
    new Date("2026-08-19T08:00:00.000Z")
  );

  await fixture.service.heartbeat(
    subject,
    "refresh-1",
    session.id,
    activeHeartbeat(1),
    new Date("2026-08-19T08:00:30.000Z")
  );
  await fixture.service.heartbeat(
    subject,
    "refresh-1",
    session.id,
    { ...activeHeartbeat(2), clientSentAt: "2026-08-19T08:00:35.000Z" },
    new Date("2026-08-19T08:00:35.000Z")
  );

  assert.equal(fixture.timeSlices.length, 1);
  assert.equal(fixture.timeSlices[0]?.durationSeconds, 30);
  assert.equal(fixture.timeSlices[0]?.learnerId, "learner-1");
});

test("错误 refresh session 不能继续已有学习会话", async () => {
  const fixture = createSessionFixture();
  await assert.rejects(
    () =>
      fixture.service.heartbeat(
        subject,
        "refresh-forged",
        "session-1",
        activeHeartbeat(1),
        now
      ),
    (error: unknown) => error instanceof AppException && error.code === 40301
  );
});

test("账号身份和已结束会话不能写学习时间", async () => {
  const fixture = createSessionFixture({
    endedAt: new Date("2026-08-19T07:59:00.000Z")
  });
  await assert.rejects(() =>
    fixture.service.heartbeat(accountSubject, "refresh-1", "session-1", activeHeartbeat(1), now)
  );
  await assert.rejects(() =>
    fixture.service.heartbeat(subject, "refresh-1", "session-1", activeHeartbeat(1), now)
  );
  assert.equal(fixture.timeSlices.length, 0);
});

test("课程项必须属于当前授权课程的已批准版本", async () => {
  const fixture = createSessionFixture({
    authorizedCourseId: "course-1",
    approvedItemId: "item-1"
  });
  await assert.rejects(
    () =>
      fixture.context.resolve(subject, {
        isLearning: true,
        courseId: "course-1",
        courseRevisionItemId: "item-of-other-course",
        materialType: "VIDEO_GUIDE",
        materialId: "video-1"
      }),
    (error: unknown) => error instanceof AppException && error.code === 40004
  );
  await assert.rejects(
    () =>
      fixture.context.resolve(subject, {
        isLearning: true,
        courseId: "course-1",
        courseRevisionItemId: "item-1",
        materialType: "VIDEO_GUIDE",
        materialId: "video-forged"
      }),
    (error: unknown) => error instanceof AppException && error.code === 40004
  );

  const unauthorized = createSessionFixture({ approvedItemId: "item-1" });
  await assert.rejects(
    () =>
      unauthorized.context.resolve(subject, {
        isLearning: true,
        courseId: "course-1",
        courseRevisionItemId: "item-1",
        materialType: "VIDEO_GUIDE",
        materialId: "video-1"
      }),
    (error: unknown) => error instanceof AppException && error.code === 40301
  );
});

test("重复和未来 sequence 不增加时间", async () => {
  const fixture = createSessionFixture();
  await fixture.service.heartbeat(
    subject,
    "refresh-1",
    "session-1",
    activeHeartbeat(2),
    now
  );
  await assert.rejects(() =>
    fixture.service.heartbeat(subject, "refresh-1", "session-1", activeHeartbeat(2), now)
  );
  await assert.rejects(() =>
    fixture.service.heartbeat(
      subject,
      "refresh-1",
      "session-1",
      { ...activeHeartbeat(3), clientSentAt: "2026-08-20T08:00:00.000Z" },
      now
    )
  );
  assert.equal(fixture.timeSlices.length, 1);
});

test("学习记录开关仅接受显式 1", () => {
  assert.equal(learnerLearningEnabled({ LEARNER_LEARNING_ENABLED: "1" }), true);
  assert.equal(learnerLearningEnabled({ LEARNER_LEARNING_ENABLED: "0" }), false);
  assert.equal(learnerLearningEnabled({}), false);
});
