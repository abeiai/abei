import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { getPrismaClient, hashPassword } from "@xueleai/database";
import { AiService } from "../src/ai/ai.service.js";

const prisma = getPrismaClient(), suffix = randomUUID();
let userId: string;
const scenarioIds: string[] = [];
const email = `native-log-${suffix}@test.abei.local`;
// 查询只用真实 Prisma；这些生成/学习者依赖在只读 listAdminTasks 路径不使用。
const service = new AiService({} as never, {} as never);

before(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "3606"); assert.equal(url.pathname, "/abei_wechat_test");
  const user = await prisma.user.create({ data: { email, nickname: "日志分页测试", passwordHash: await hashPassword(randomUUID()) } });
  userId = user.id;
  for (const [name, requiredCapabilities] of [["image", ["image_generation"]], ["text", ["TEXT"]], ["video", ["IMAGE_GENERATION", "VIDEO_GENERATION"]]] as const) {
    const scenario = await prisma.aiScenario.create({ data: { name: `query-${name}`, slug: `query-${name}-${suffix}`, promptTemplate: "测试", costCredits: 0, requiredCapabilities: [...requiredCapabilities] } });
    scenarioIds.push(scenario.id);
  }
  await prisma.aiTask.createMany({ data: [
    ...Array.from({ length: 1005 }, (_, index) => ({ id: `image-${String(index).padStart(4, "0")}-${suffix}`, userId, scenarioId: scenarioIds[0]!, input: {}, estimatedCredits: 0, status: "SUCCEEDED" as const, createdAt: new Date("2026-10-01T00:00:00Z") })),
    ...Array.from({ length: 250 }, (_, index) => ({ id: `text-${index}-${suffix}`, userId, scenarioId: scenarioIds[1]!, input: {}, estimatedCredits: 0, createdAt: new Date("2026-10-02T00:00:00Z") })),
    { id: `video-${suffix}`, userId, scenarioId: scenarioIds[2]!, input: {}, estimatedCredits: 0, createdAt: new Date("2026-10-03T00:00:00Z") },
  ] });
});
after(async () => {
  if (userId) { await prisma.aiTask.deleteMany({ where: { userId } }); await prisma.user.delete({ where: { id: userId } }); }
  await prisma.aiScenario.deleteMany({ where: { id: { in: scenarioIds } } }); await prisma.$disconnect();
});

test("先按场景类型筛选再分页，较新的其他类型不能遮住图片记录", async () => {
  const rows = await service.listAdminTasks({ taskType: "IMAGE", user: email, page: "1", pageSize: "50" });
  assert.equal(rows.length, 50);
  assert.equal(rows[0]?.id, `image-1004-${suffix}`);
  assert.ok(rows.every(row => row.id.startsWith("image-")));
});
test("超过一千条的新版日志仍能继续翻页，混合图片视频场景归为视频", async () => {
  const rows = await service.listAdminTasks({ taskType: "IMAGE", user: email, page: "21", pageSize: "50" });
  assert.equal(rows.length, 5);
  assert.equal(rows[0]?.id, `image-0004-${suffix}`);
  const videos = await service.listAdminTasks({ taskType: "VIDEO", user: email, page: "1", pageSize: "50" });
  assert.deepEqual(videos.map(row => row.id), [`video-${suffix}`]);
});
