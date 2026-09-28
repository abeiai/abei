import assert from "node:assert/strict";
import test from "node:test";

import { AiService } from "../src/ai/ai.service.js";

type AssociationCounts = {
  aiTasks: number;
  audioTasks: number;
  learnerAuthorizations: number;
  activityEvents: number;
  usageStats: number;
  learningTimeSlices: number;
  dailyLearningSummaries: number;
};

const emptyCounts: AssociationCounts = {
  aiTasks: 0,
  audioTasks: 0,
  learnerAuthorizations: 0,
  activityEvents: 0,
  usageStats: 0,
  learningTimeSlices: 0,
  dailyLearningSummaries: 0
};

test("系统内置场景即使没有关联也不能删除", async () => {
  const fixture = createService({
    id: "builtin-scenario",
    name: "内置场景",
    slug: "builtin-scenario",
    isBuiltIn: true
  });

  const check = await fixture.service.checkScenarioDelete("builtin-scenario");

  assert.equal(check.canDelete, false);
  assert.match(check.message, /系统内置场景/);
  await assert.rejects(() => fixture.service.deleteScenario("builtin-scenario"), /系统内置场景/);
  assert.equal(fixture.wasDeleted(), false);
});

test("场景存在任一业务或历史关联时返回明细并拒绝删除", async () => {
  const counts: AssociationCounts = {
    aiTasks: 3,
    audioTasks: 2,
    learnerAuthorizations: 1,
    activityEvents: 4,
    usageStats: 5,
    learningTimeSlices: 6,
    dailyLearningSummaries: 7
  };
  const fixture = createService({
    id: "used-scenario",
    name: "已使用场景",
    slug: "used-scenario",
    isBuiltIn: false
  }, counts);

  const check = await fixture.service.checkScenarioDelete("used-scenario");

  assert.equal(check.canDelete, false);
  assert.equal(check.totalAssociations, 28);
  assert.deepEqual(check.associations, counts);
  assert.match(check.message, /28 条关联数据/);
  await assert.rejects(() => fixture.service.deleteScenario("used-scenario"), /请先解除或清理关联/);
  assert.equal(fixture.wasDeleted(), false);
});

test("无关联的自定义场景可以删除", async () => {
  const fixture = createService({
    id: "custom-scenario",
    name: "自定义场景",
    slug: "custom-scenario",
    isBuiltIn: false
  });

  const check = await fixture.service.checkScenarioDelete("custom-scenario");
  const result = await fixture.service.deleteScenario("custom-scenario");

  assert.equal(check.canDelete, true);
  assert.equal(check.totalAssociations, 0);
  assert.deepEqual(result, {
    deleted: true,
    scenarioId: "custom-scenario",
    name: "自定义场景",
    slug: "custom-scenario"
  });
  assert.equal(fixture.wasDeleted(), true);
});

test("最终删除在事务内重新检查并阻止确认期间出现的新关联", async () => {
  const fixture = createService(
    {
      id: "racing-scenario",
      name: "竞态场景",
      slug: "racing-scenario",
      isBuiltIn: false
    },
    emptyCounts,
    { ...emptyCounts, audioTasks: 1 }
  );

  await assert.rejects(() => fixture.service.deleteScenario("racing-scenario"), /1 条关联数据/);
  assert.equal(fixture.usedTransaction(), true);
  assert.equal(fixture.wasDeleted(), false);
});

test("Serializable 冲突后重新检查关联并返回中文阻止原因", async () => {
  const fixture = createService(
    {
      id: "conflicting-scenario",
      name: "并发场景",
      slug: "conflicting-scenario",
      isBuiltIn: false
    },
    { ...emptyCounts, learningTimeSlices: 1 },
    emptyCounts,
    { code: "P2034" }
  );

  await assert.rejects(
    () => fixture.service.deleteScenario("conflicting-scenario"),
    /仍有 1 条关联数据/
  );
  assert.equal(fixture.usedTransaction(), true);
  assert.equal(fixture.wasDeleted(), false);
});

function createService(
  scenario: { id: string; name: string; slug: string; isBuiltIn: boolean },
  counts: AssociationCounts = emptyCounts,
  transactionCounts: AssociationCounts = counts,
  transactionError?: unknown
) {
  let deleted = false;
  let transactionUsed = false;
  const scenarioDelegate = {
    findUnique: async () => scenario,
    delete: async () => {
      deleted = true;
      return scenario;
    }
  };
  const delegates = (current: AssociationCounts) => ({
    aiScenario: scenarioDelegate,
    aiTask: { count: async () => current.aiTasks },
    audioTask: { count: async () => current.audioTasks },
    learnerScenarioAuthorization: { count: async () => current.learnerAuthorizations },
    learnerActivityEvent: { count: async () => current.activityEvents },
    aiUsageDailyStat: { count: async () => current.usageStats },
    learnerLearningTimeSlice: { count: async () => current.learningTimeSlices },
    learnerDailyLearningSummary: { count: async () => current.dailyLearningSummaries }
  });
  const transactionClient = delegates(transactionCounts);
  const prisma = {
    ...delegates(counts),
    $transaction: async <T>(callback: (client: typeof transactionClient) => Promise<T>) => {
      transactionUsed = true;
      if (transactionError) {
        throw transactionError;
      }
      return callback(transactionClient);
    }
  };
  const service = new AiService(undefined as never, undefined as never);
  (service as unknown as { prisma: typeof prisma }).prisma = prisma;

  return {
    service,
    wasDeleted: () => deleted,
    usedTransaction: () => transactionUsed
  };
}
