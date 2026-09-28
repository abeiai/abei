import assert from "node:assert/strict";
import test from "node:test";

import { getPrismaClient } from "@xueleai/database";
import { LearnerActivityService } from "../src/profiles/learner-activity.service.js";
import type { ProfileSubject } from "../src/profiles/profile-context.types.js";
import { TypingService, typingSubjectKey } from "../src/typing/typing.service.js";

test("主体键区分主账号与学习者", () => {
  assert.equal(
    typingSubjectKey({ userId: "user-1", mode: "ACCOUNT", learnerId: null }),
    "account:user-1"
  );
  assert.equal(
    typingSubjectKey({ userId: "user-1", mode: "LEARNER", learnerId: "learner-1" }),
    "learner:learner-1"
  );
});

test("会话与作答幂等键只创建一条记录，且尝试不保存完整输入", async () => {
  const prisma = getPrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      email: `typing-${suffix}@example.test`,
      passwordHash: "test-only",
      nickname: "打字记词测试"
    }
  });
  const library = await prisma.englishContentLibrary.create({
    data: {
      slug: `typing-test-${suffix}`,
      title: "测试英文库",
      status: "PUBLISHED",
      sourceHash: `hash-${suffix}`,
      units: {
        create: {
          code: "unit-1",
          title: "Unit 1",
          status: "PUBLISHED",
          items: {
            create: {
              text: "hello",
              normalizedText: "hello",
              itemType: "WORD",
              translation: "你好",
              sourceOrder: 1,
              reviewStatus: "VERIFIED"
            }
          }
        }
      }
    },
    include: { units: { include: { items: true } } }
  });
  const learner = await prisma.learner.create({
    data: {
      userId: user.id,
      accountNumber: 100,
      nickname: "学习者测试",
      grade: "GRADE_7"
    }
  });
  const subject: ProfileSubject = { userId: user.id, mode: "ACCOUNT", learnerId: null };
  const learnerSubject: ProfileSubject = {
    userId: user.id,
    mode: "LEARNER",
    learnerId: learner.id
  };
  const service = new TypingService(new LearnerActivityService(prisma), prisma);

  try {
    const input = {
      libraryId: library.id,
      unitId: library.units[0]!.id,
      scope: "UNIT" as const,
      targetItemCount: 10 as const,
      clientSessionKey: `session-${suffix}`
    };
    const first = await service.createSession(subject, null, input);
    const duplicate = await service.createSession(subject, null, input);
    assert.equal(duplicate.id, first.id);
    assert.equal(await prisma.typingPracticeSession.count({
      where: { clientSessionKey: input.clientSessionKey }
    }), 1);

    const attempt = {
      clientAttemptId: `attempt-${suffix}`,
      answer: "hello",
      durationMs: 800
    };
    const firstAttempt = await service.submitAttempt(subject, null, first.id, attempt);
    const duplicateAttempt = await service.submitAttempt(subject, null, first.id, attempt);
    assert.equal(firstAttempt.correct, true);
    assert.equal(duplicateAttempt.correct, true);
    assert.equal(await prisma.typingAttempt.count({
      where: { clientAttemptId: attempt.clientAttemptId }
    }), 1);

    const stored = await prisma.typingAttempt.findUnique({
      where: { clientAttemptId: attempt.clientAttemptId }
    });
    assert.equal(Object.prototype.hasOwnProperty.call(stored, "answer"), false);

    const audioWord = `typing-audio-${suffix}`;
    await prisma.dictionaryEntry.create({
      data: { word: audioWord, normalizedWord: audioWord, dictionaryAudioAssets: { create:
        ["uk-female", "uk-male", "us-female", "us-male"].map((variant) => ({
          variant, label: variant, accent: "测试", gender: "测试", provider: "test", model: "test", voice: variant,
          objectKey: `test/${suffix}/${variant}.mp3`, url: `/test/${suffix}/${variant}.mp3`, sizeBytes: 1, sha256: "test"
        }))
      } }
    });
    const secondUnit = await prisma.englishContentUnit.create({
      data: {
        libraryId: library.id, code: "unit-2", title: "第二单元", status: "PUBLISHED",
        items: { create: {
          text: audioWord, normalizedText: audioWord, itemType: "WORD",
          translation: "世界", sourceOrder: 1, reviewStatus: "VERIFIED"
        } }
      }
    });
    const whole = await service.createSession(subject, null, {
      ...input, unitId: undefined, targetItemCount: 0,
      clientSessionKey: `whole-${suffix}`, abandonExisting: true
    });
    assert.ok(whole.nextMedia, "全册会话提供下一题媒体预加载数据");
    assert.deepEqual(Object.keys(whole.nextMedia).sort(), ["audioUrls", "id", "imageUrl"]);
    assert.ok(whole.question?.audioUrls);
    assert.equal(Object.keys(whole.nextMedia.audioUrls).length, 4);
    assert.equal(whole.nextMedia.audioUrls["us-male"], `/test/${suffix}/us-male.mp3`);
    const wholeItems = await prisma.typingPracticeSessionItem.findMany({ where: { sessionId: whole.id } });
    assert.equal(wholeItems.length, 2, "全册包含已学词和其他单元的新词");
    assert.ok(wholeItems.some((item) => item.itemId === library.units[0]!.items[0]!.id));
    const unit = await service.createSession(subject, null, {
      ...input, unitId: secondUnit.id, targetItemCount: 0,
      clientSessionKey: `unit-${suffix}`, abandonExisting: true
    });
    assert.equal(unit.question?.audioUrls["uk-female"], `/test/${suffix}/uk-female.mp3`);
    assert.equal(unit.nextMedia, null, "最后一题不预加载其他题目");
    const unitItems = await prisma.typingPracticeSessionItem.findMany({ where: { sessionId: unit.id } });
    assert.equal(unitItems.length, 1);
    assert.equal(unitItems[0]!.answerSnapshot, audioWord);

    const reviews = await service.listReviews(subject, {
      page: "1",
      pageSize: "50"
    } as never);
    assert.equal(reviews.page, 1);
    assert.equal(reviews.pageSize, 50);
    assert.equal(reviews.total, 1);

    const [accountSummary, learnerSummary, accountHistory, learnerHistory] = await Promise.all([
      service.reviewSummary(subject),
      service.reviewSummary(learnerSubject),
      service.history(subject),
      service.history(learnerSubject)
    ]);
    assert.equal(accountSummary.total, 1);
    assert.equal(learnerSummary.total, 0);
    assert.equal(accountHistory.summary.sessionCount, 3);
    assert.equal(learnerHistory.summary.sessionCount, 0);
  } finally {
    await prisma.dictionaryEntry.deleteMany({ where: { word: `typing-audio-${suffix}` } });
    await prisma.learner.delete({ where: { id: learner.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.englishContentLibrary.delete({ where: { id: library.id } });
  }
});
