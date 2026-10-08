import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPrismaClient, hashPassword } from "@xueleai/database";
import { AiService } from "../src/ai/ai.service.js";
import { AppException } from "../src/common/app-exception.js";

test("视频任务查询兼容旧编号并保持账号、学员和场景隔离", async context => {
  const db = getPrismaClient();
  const unique = randomUUID();
  const users: string[] = [];
  let otherScenarioId: string | undefined;
  try {
    const scenario = await db.aiScenario.findUniqueOrThrow({ where: { slug: "experience-video-generation" } });
    const passwordHash = await hashPassword(randomUUID());
    for (const index of [0, 1]) {
      const user = await db.user.create({ data: { email: `video-lookup-${unique}-${index}@example.com`, nickname: "任务查询测试", passwordHash } });
      users.push(user.id);
    }
    const ownerId = users[0]!;
    const otherUserId = users[1]!;
    const learner = await db.learner.create({ data: { userId: ownerId, accountNumber: 100, nickname: "任务查询学员", grade: "GRADE_1" } });
    const otherLearner = await db.learner.create({ data: { userId: ownerId, accountNumber: 101, nickname: "另一学员", grade: "GRADE_1" } });
    const providerTaskId = `provider-${unique}`;
    const videoUrl = "https://example.com/video-task-test.mp4";
    const task = await db.aiTask.create({ data: { userId: ownerId, learnerId: learner.id, scenarioId: scenario.id,
      status: "SUCCEEDED", input: { providerTaskId, providerVideoUrl: videoUrl }, estimatedCredits: 0 } });
    const otherScenario = await db.aiScenario.create({ data: { name: "任务查询隔离测试", slug: `video-lookup-${unique}`, promptTemplate: "测试", promptVariables: [], costCredits: 0 } });
    otherScenarioId = otherScenario.id;
    const unrelatedTask = await db.aiTask.create({ data: { userId: ownerId, scenarioId: otherScenario.id,
      status: "SUCCEEDED", input: { providerTaskId: `other-${unique}`, providerVideoUrl: videoUrl }, estimatedCredits: 0 } });
    const service = new AiService(undefined as never, undefined as never);
    const account = { userId: ownerId, mode: "ACCOUNT" as const, learnerId: null };
    const learnerSubject = { userId: ownerId, mode: "LEARNER" as const, learnerId: learner.id };
    const missing = (error: unknown) => error instanceof AppException && error.code === 40401;

    await context.test("本站编号能取回已完成视频", async () => {
      assert.equal((await service.getVideoGenerationTask(account, task.id)).videoUrl, videoUrl);
    });
    await context.test("旧页面的服务商编号取回同一视频", async () => {
      assert.equal((await service.getVideoGenerationTask(account, providerTaskId)).videoUrl, videoUrl);
    });
    await context.test("其他账号不能通过任一编号查询任务", async () => {
      for (const id of [task.id, providerTaskId]) await assert.rejects(service.getVideoGenerationTask({ ...account, userId: otherUserId }, id), missing);
    });
    await context.test("学员只能查询自己的任务", async () => {
      assert.equal((await service.getVideoGenerationTask(learnerSubject, providerTaskId)).videoUrl, videoUrl);
      for (const id of [task.id, providerTaskId]) await assert.rejects(service.getVideoGenerationTask({ ...learnerSubject, learnerId: otherLearner.id }, id), missing);
    });
    await context.test("同一账号的非视频任务和未知编号仍返回不存在", async () => {
      for (const id of [unrelatedTask.id, `other-${unique}`, randomUUID()]) await assert.rejects(service.getVideoGenerationTask(account, id), missing);
    });
  } finally {
    await db.aiTask.deleteMany({ where: { userId: { in: users } } });
    await db.learner.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    if (otherScenarioId) await db.aiScenario.delete({ where: { id: otherScenarioId } });
    await db.$disconnect();
  }
});
