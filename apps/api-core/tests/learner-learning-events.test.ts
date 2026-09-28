import assert from "node:assert/strict";
import test from "node:test";
import { createEventFixture, now, subject } from "./helpers/learner-learning-fixture.js";

test("客户端不能提交完成状态或正确率，练习由服务端判定", async () => {
  const fixture = createEventFixture();
  const result = await fixture.service.recordBatch(
    subject,
    "refresh-1",
    "session-1",
    {
      events: [
        {
          eventId: "event-000000000001",
          sequence: 1,
          type: "PRACTICE_SUBMITTED",
          occurredAt: "2026-08-19T08:01:00.000Z",
          partKey: "PRACTICE",
          itemId: "question-1",
          selectedIndex: 2,
          context: fixture.learningContext
        }
      ]
    },
    now
  );

  assert.equal(result.acceptedCount, 1);
  assert.equal(fixture.activityEvents[0]?.metrics.isCorrect, true);
  assert.equal(
    Object.hasOwn(fixture.activityEvents[0]?.metrics ?? {}, "selectedIndex"),
    false
  );
});

test("同一 eventId 重试不重复增加进度", async () => {
  const fixture = createEventFixture();
  const event = fixture.mediaEvent("event-000000000002", 0, 30);
  await fixture.record(event);
  await fixture.record(event);

  assert.equal(fixture.activityEvents.length, 1);
  assert.deepEqual(fixture.partProgress.progressData.playedRanges, [
    { startSeconds: 0, endSeconds: 30 }
  ]);
});

test("事件上下文内容版本隔离且伪造节点被拒绝", async () => {
  const fixture = createEventFixture();
  await assert.rejects(() =>
    fixture.record({
      eventId: "event-000000000003",
      sequence: 3,
      type: "NODE_LEARNED",
      occurredAt: now.toISOString(),
      partKey: "GUIDED",
      itemId: "forged-node",
      context: fixture.learningContext
    })
  );
  assert.equal(fixture.activityEvents.length, 0);
});

test("事件类型不能写入不对应的课件部分", async () => {
  const fixture = createEventFixture();
  await assert.rejects(() =>
    fixture.record({
      eventId: "event-000000000004",
      sequence: 4,
      type: "PRACTICE_SUBMITTED",
      occurredAt: now.toISOString(),
      partKey: "AUTONOMOUS",
      itemId: "question-1",
      selectedIndex: 2,
      context: fixture.learningContext
    })
  );
  assert.equal(fixture.activityEvents.length, 0);
});

test("闪卡进度只接受当前学习者和当前牌组的服务端复习记录", async () => {
  const fixture = createEventFixture({ materialType: "LEARNING_FLASHCARD" });
  await fixture.record({
    ...fixture.flashcardEvent("event-000000000005"),
    grade: "MASTERED"
  } as never);

  assert.equal(fixture.activityEvents[0]?.itemKey, "card-1");
  assert.deepEqual(fixture.activityEvents[0]?.metrics, {
    hardCount: 1,
    blurryCount: 0,
    masteredCount: 0,
    reviewCount: 1
  });

  const forged = createEventFixture({ materialType: "LEARNING_FLASHCARD" });
  forged.flashcardReviews[0]!.learnerId = "learner-forged";
  await assert.rejects(() =>
    forged.record(forged.flashcardEvent("event-000000000006"))
  );
  assert.equal(forged.activityEvents.length, 0);
});
