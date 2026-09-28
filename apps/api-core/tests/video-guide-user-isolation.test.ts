import assert from "node:assert/strict";
import test from "node:test";

import { VideoGuideService } from "../src/video-guide/video-guide.service.js";

function lessonRecord(userId: string) {
  return {
    id: `lesson-${userId}`,
    userId,
    learnerId: null,
    title: `${userId} 的课件`,
    mediaName: "video.mp4",
    mediaType: "VIDEO",
    mediaMimeType: "video/mp4",
    mediaSizeBytes: 1024,
    mediaUrl: "https://cdn.example.com/video.mp4",
    mediaStorageKey: "video.mp4",
    subtitleName: null,
    subtitleFormat: "SRT",
    subtitleSizeBytes: null,
    subtitleUrl: null,
    subtitleStorageKey: null,
    status: "DRAFT",
    shareToken: `share-${userId}`,
    content: {},
    errorMessage: null,
    createdAt: new Date("2026-07-25T00:00:00.000Z"),
    updatedAt: new Date("2026-07-25T00:00:00.000Z"),
    finishedAt: null
  };
}

test("视频导学列表、详情和删除都以当前用户为权限边界", async () => {
  const records = [lessonRecord("user-a"), lessonRecord("user-b")];
  const findManyWhere: Array<Record<string, unknown>> = [];
  const findFirstWhere: Array<Record<string, unknown>> = [];
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    videoGuideLesson: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        findFirstWhere.push(where);
        return records.find(
          (record) => record.id === where.id && record.userId === where.userId
        ) ?? null;
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    videoGuideLesson: {
      findMany: async ({ where }: { where: { userId: string } }) => {
        findManyWhere.push(where);
        return records.filter((record) => record.userId === where.userId);
      },
      findFirst: transaction.videoGuideLesson.findFirst
    }
  };
  const service = new VideoGuideService({} as never, {} as never, {
    recordMaterialChange: async () => undefined
  } as never);

  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  const firstUserLessons = await service.listUserLessons({ userId: "user-a", mode: "ACCOUNT", learnerId: null });

  assert.deepEqual(firstUserLessons.map((lesson) => lesson.id), ["lesson-user-a"]);
  assert.deepEqual(findManyWhere, [{ userId: "user-a" }]);
  await assert.rejects(
    () => service.getUserLesson({ userId: "user-b", mode: "ACCOUNT", learnerId: null }, "lesson-user-a"),
    /导学课件不存在/
  );
  await assert.rejects(
    () => service.deleteUserLesson({ userId: "user-b", mode: "ACCOUNT", learnerId: null }, "lesson-user-a"),
    /导学课件不存在/
  );
  assert.deepEqual(findFirstWhere, [
    { id: "lesson-user-a", userId: "user-b" },
    { id: "lesson-user-a", userId: "user-b" }
  ]);
});
