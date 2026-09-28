import assert from "node:assert/strict";
import test from "node:test";
import {
  formatLearningDuration,
  learnerLearningCenterMetrics,
  type LearnerLearningOverview
} from "../src/lib/learner-learning-types.js";

const overview: LearnerLearningOverview = {
  range: { from: "2026-08-13", to: "2026-08-19" },
  totals: {
    onlineSeconds: 7200,
    studySeconds: 3600,
    learningDays: 3,
    startedMaterialCount: 4,
    completedMaterialCount: 2,
    completionRate: 50
  },
  daily: [
    { date: "2026-08-18", onlineSeconds: 1800, studySeconds: 1200 },
    { date: "2026-08-19", onlineSeconds: 59, studySeconds: 0 }
  ],
  recentMaterials: []
};

test("学习时长使用小时和分钟且覆盖零与不足一分钟", () => {
  assert.equal(formatLearningDuration(0), "0 分钟");
  assert.equal(formatLearningDuration(59), "少于 1 分钟");
  assert.equal(formatLearningDuration(3600), "1 小时");
  assert.equal(formatLearningDuration(7260), "2 小时 1 分钟");
});

test("学习中心展示当天时长和本周累计课件指标", () => {
  assert.deepEqual(learnerLearningCenterMetrics(overview), {
    todayOnline: "少于 1 分钟",
    todayStudy: "0 分钟",
    learningDays: "3 天",
    startedMaterials: "4 个",
    completedMaterials: "2 个"
  });
});
