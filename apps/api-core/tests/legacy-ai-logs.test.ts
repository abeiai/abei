import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { OperationsModule } from "../src/operations/operations.module.js";
import { HttpExceptionFilter } from "../src/common/http-exception.filter.js";
import { getPrismaClient, hashPassword } from "@xueleai/database";
import { signJwt } from "../src/security/jwt.js";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let app: INestApplication;
const base = "http://127.0.0.1:3608/api/admin/legacy-ai-logs";
const prisma = getPrismaClient();
const suffix = randomUUID();
let adminId: string;
let adminCookie: string;
let userId: string;
let otherUserId: string;
let fixtureReady = false;
let assetDir: string;
let outsideDir: string;
const logId = (name: string) => `${name}-${suffix}`;

async function seedLogs() {
  if (fixtureReady) return;
  const owner = await prisma.user.create({ data: { email: `owner-${suffix}@test.abei.local`, nickname: "迁移日志所有者", passwordHash: await hashPassword(randomUUID()) } });
  const other = await prisma.user.create({ data: { email: `other-${suffix}@test.abei.local`, nickname: "另一个用户", passwordHash: await hashPassword(randomUUID()) } });
  userId = owner.id; otherUserId = other.id;
  const sourceSystem = `fixture-${suffix}`;
  await prisma.legacyAiLog.createMany({ data: [
    ...Array.from({ length: 55 }, (_, index) => ({ id: logId(`chat-${String(index).padStart(2, "0")}`), sourceSystem, sourceTable: "app_ai_chatmessage", sourcePk: String(index), sourceUserId: "123", userId, kind: "CHAT" as const, status: "SUCCEEDED" as const, requestedAt: new Date("2026-10-01T00:00:00Z"), application: "旧应用", modelName: "旧模型", inputPreview: "历史输入 Authorization: Bearer private-preview-token", inputText: "完整用户输入", outputText: "完整 AI 回复", systemPrompt: "系统提示词", parameters: { api_key: "hidden-provider-key", safe: { temperature: 0.7 }, Authorization: "Bearer secret" } })),
    { id: logId("audio"), sourceSystem, sourceTable: "app_ai_ttsmessage", sourcePk: "200", sourceUserId: "123", userId, kind: "AUDIO", status: "FAILED", sourceStatus: "3", requestedAt: new Date("2026-10-01T15:59:59.999Z"), voiceName: "旧音色", inputText: "待合成的完整文本", errorMessage: "生成失败 access_token=private-error-token" },
    { id: logId("image"), sourceSystem, sourceTable: "app_ai_drawmessage", sourcePk: "300", sourceUserId: "123", userId, kind: "IMAGE", status: "SUCCEEDED", requestedAt: new Date("2026-09-30T16:00:00Z"), parameters: { prompt_zh: "森林参考图", reference: { character: ["https://old.invalid/private.png?access_token=private-reference-token"] } } },
    { id: logId("video"), sourceSystem, sourceTable: "app_ai_videomessage", sourcePk: "400", kind: "VIDEO", status: "RUNNING", requestedAt: new Date("2026-10-01T16:00:00Z"), sourceUserId: "999" },
    { id: logId("other"), sourceSystem, sourceTable: "app_ai_chatmessage", sourcePk: "900", userId: otherUserId, kind: "CHAT", status: "UNKNOWN", requestedAt: new Date("2026-09-01T00:00:00Z"), inputText: "其他用户内容不能通过当前会话关联展示" },
  ] });
  const session = await prisma.legacyAiSession.create({ data: { id: logId("session"), sourceSystem, sourceTable: "app_ai_chatsubject", sourcePk: "10", userId, sourceUserId: "123", title: "旧对话", requestedAt: new Date("2026-10-01T00:00:00Z") } });
  await prisma.legacyAiSessionItem.createMany({ data: [
    { sessionId: session.id, logId: logId("chat-00"), position: 1 },
    { sessionId: session.id, logId: logId("chat-01"), position: 0 },
    { sessionId: session.id, logId: logId("other"), position: 2 },
    { sessionId: session.id, sourceMsgId: "missing-message", position: 3 },
  ] });
  fixtureReady = true;
}

async function request(query = "", cookie = adminCookie) {
  return fetch(base + query, { headers: { Cookie: cookie } });
}

before(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "3606");
  assert.equal(url.pathname, "/abei_wechat_test");
  assetDir = await mkdtemp(join(tmpdir(), "abei-private-log-assets-"));
  outsideDir = await mkdtemp(join(tmpdir(), "abei-private-log-outside-"));
  process.env.LEGACY_AI_LOG_ASSET_DIR = assetDir;
  const admin = await prisma.adminUser.create({ data: { email: `legacy-${suffix}@test.abei.local`, name: "日志测试管理员", passwordHash: await hashPassword(randomUUID()) } });
  adminId = admin.id;
  adminCookie = "xueleai_admin_access=" + signJwt({ sub: admin.id, email: admin.email, type: "ADMIN" }, process.env.JWT_ACCESS_SECRET!, 600);
  app = await NestFactory.create(OperationsModule, { logger: false });
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(3608, "127.0.0.1");
});
after(async () => {
  await app?.close();
  await prisma.legacyAiSession.deleteMany({ where: { sourceSystem: `fixture-${suffix}` } });
  await prisma.legacyAiLog.deleteMany({ where: { sourceSystem: `fixture-${suffix}` } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId].filter(Boolean) } } });
  if (adminId) await prisma.adminUser.delete({ where: { id: adminId } });
  await rm(assetDir, { recursive: true, force: true });
  await rm(outsideDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

test("历史日志列表、详情和素材均先验证管理员身份", async () => {
  for (const path of ["", "/unknown-log", "/unknown-log/assets/unknown-asset/file"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 401, `未登录请求 ${path || "列表"} 应被拒绝`);
    assert.equal((await response.json()).code, 40101);
  }
});

test("有效管理员可读取空历史列表，响应不缓存且分页明确", async () => {
  const response = await fetch(base, { headers: { Cookie: adminCookie } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const payload = await response.json();
  assert.equal(payload.code, 0);
  assert.deepEqual(payload.data, { items: [], total: 0, page: 1, pageSize: 50 });
});

test("四类日志、旧用户、模型和状态筛选在数据库中生效，失败和无主记录仍可查询", async () => {
  await seedLogs();
  for (const [kind, expected] of [["CHAT", 56], ["IMAGE", 1], ["AUDIO", 1], ["VIDEO", 1]] as const) {
    const response = await request(`?kind=${kind}`);
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.total, expected);
    assert.ok(data.items.every((item: { kind: string }) => item.kind === kind));
  }
  const filtered = await (await request("?user=123&model=" + encodeURIComponent("旧模型") + "&application=" + encodeURIComponent("旧应用") + "&status=SUCCEEDED")).json();
  assert.equal(filtered.data.total, 55);
  const orphan = await (await request("?kind=VIDEO&user=999")).json();
  assert.equal(orphan.data.items[0].user, null);
  const exact = await (await request("?sourceId=200&status=FAILED")).json();
  assert.equal(exact.data.total, 1);
  assert.equal(exact.data.items[0].sourcePk, "200");
});

test("上海自然日范围包含首尾且排除下一天，同时间记录稳定分页", async () => {
  await seedLogs();
  const dateRange = await (await request("?startDate=2026-10-01&endDate=2026-10-01")).json();
  assert.equal(dateRange.data.total, 57);
  const first = await (await request("?kind=CHAT&page=1")).json();
  const second = await (await request("?kind=CHAT&page=2")).json();
  assert.equal(first.data.items.length, 50);
  assert.equal(second.data.items.length, 6);
  const ids = [...first.data.items, ...second.data.items].map((x: { id: string }) => x.id);
  assert.equal(new Set(ids).size, 56);
  assert.equal(first.data.items[0].id, logId("chat-54"));
});

test("列表不返回全文或参数，详情脱敏且会话按顺序展示并隔离跨用户引用", async () => {
  await seedLogs();
  const list = await (await request("?sourceId=0")).json();
  const row = list.data.items[0];
  for (const key of ["inputText", "outputText", "systemPrompt", "parameters"]) assert.equal(key in row, false);
  assert.doesNotMatch(JSON.stringify(list), /private-preview-token/);
  const response = await request("/" + logId("chat-00"));
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.inputText, "完整用户输入");
  assert.equal(data.systemPrompt, "系统提示词");
  assert.equal(data.parameters.safe.temperature, 0.7);
  assert.doesNotMatch(JSON.stringify(data), /hidden-provider-key|Bearer secret|其他用户内容/);
  assert.deepEqual(data.sessions[0].items.map((item: { position: number }) => item.position), [0, 1, 2, 3]);
  assert.equal(data.sessions[0].items[2].log, null);
  assert.equal(data.sessions[0].items[3].log, null);
  assert.equal((await request("/does-not-exist")).status, 404);
});

test("长会话分段分页可完整访问，页面不会一次返回全部全文", async () => {
  await seedLogs();
  const session = await prisma.legacyAiSession.create({ data: { id: logId("long-session"), sourceSystem: `fixture-${suffix}`, sourceTable: "app_ai_chatsubject", sourcePk: "11", userId, requestedAt: new Date("2026-10-01T00:00:00Z") } });
  await prisma.legacyAiSessionItem.createMany({ data: Array.from({ length: 55 }, (_, position) => ({ sessionId: session.id, logId: logId(`chat-${String(position).padStart(2, "0")}`), position })) });
  const first = await (await request("/" + logId("chat-00"))).json();
  const a = first.data.sessions.find((row: { id: string }) => row.id === session.id);
  assert.equal(a.total, 55);
  assert.equal(a.items.length, 50);
  assert.equal(a.page, 1);
  const second = await (await request("/" + logId("chat-00") + "?sessionPage=2")).json();
  const b = second.data.sessions.find((row: { id: string }) => row.id === session.id);
  assert.deepEqual(b.items.map((row: { position: number }) => row.position), [50, 51, 52, 53, 54]);
  assert.equal(b.page, 2);
  assert.equal((await request("/" + logId("chat-00") + "?sessionPage=999999")).status, 400);
});

test("非法日期、重复参数、枚举和页码在查询前被拒绝", async () => {
  for (const query of ["?startDate=2026-02-30", "?startDate=2026-10-08&endDate=2026-10-01", "?kind=INVALID", "?status=INVALID", "?page=-1", "?page=10001", "?kind=CHAT&kind=IMAGE"]) {
    const response = await request(query);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).code, 40001);
  }
});

test("前台用户和停用管理员不能读取历史日志，来源唯一键阻止重复导入", async () => {
  await seedLogs();
  const cookie = "xueleai_user_access=" + signJwt({ sub: userId, email: "user@test.abei.local", type: "USER" }, process.env.JWT_ACCESS_SECRET!, 600);
  assert.equal((await request("", cookie)).status, 401);
  assert.equal((await request("/" + logId("chat-00"), cookie)).status, 401);
  await prisma.adminUser.update({ where: { id: adminId }, data: { status: "DISABLED" } });
  assert.equal((await request()).status, 401);
  await prisma.adminUser.update({ where: { id: adminId }, data: { status: "ACTIVE" } });
  await assert.rejects(() => prisma.legacyAiLog.create({ data: { sourceSystem: `fixture-${suffix}`, sourceTable: "app_ai_chatmessage", sourcePk: "0", kind: "CHAT", requestedAt: new Date() } }), (error: unknown) => (error as { code: string }).code === "P2002");
});

test("历史媒体必须经过管理员鉴权并支持音视频 Range，不泄露存储路径", async () => {
  await seedLogs();
  await writeFile(join(assetDir, "audio-test.mp3"), Buffer.from("0123456789"));
  const asset = await prisma.legacyAiLogAsset.create({ data: { logId: logId("audio"), position: 0, role: "OUTPUT", fieldPath: "assistant_content", mediaType: "AUDIO", status: "AVAILABLE", mimeType: "audio/mpeg", storageKey: "audio-test.mp3", filename: "旧音频.mp3" } });
  const path = `/${logId("audio")}/assets/${asset.id}/file`;
  assert.equal((await request(path, "")).status, 401);
  const detail = await (await request("/" + logId("audio"))).json();
  assert.equal(detail.data.assets[0].url, "/api/admin/legacy-ai-logs" + path);
  assert.doesNotMatch(JSON.stringify(detail), /audio-test\.mp3|abei-private-log-assets/);
  const response = await fetch(base + path, { headers: { Cookie: adminCookie, Range: "bytes=2-5" } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(await response.text(), "2345");
  const invalid = await fetch(base + path, { headers: { Cookie: adminCookie, Range: "bytes=99-" } });
  assert.equal(invalid.status, 416);
  assert.equal((await request(path.replace(logId("audio"), logId("image")))).status, 404);
});

test("不跟随旧 URL，不读取穿越路径或符号链接，不提供 HTML/SVG 素材", async () => {
  await seedLogs();
  await writeFile(join(outsideDir, "outside.mp3"), "outside-sensitive-file");
  await symlink(join(outsideDir, "outside.mp3"), join(assetDir, "link.mp3"));
  for (const [index, key, mimeType] of [[0, "../outside.mp3", "audio/mpeg"], [1, "link.mp3", "audio/mpeg"], [2, "https://old.invalid/audio.mp3", "audio/mpeg"], [3, "not-there.mp3", "audio/mpeg"], [4, "audio-test.mp3", "text/html"], [5, "audio-test.mp3", "image/svg+xml"]] as const) {
    const asset = await prisma.legacyAiLogAsset.create({ data: { logId: logId("image"), position: index, role: "OUTPUT", fieldPath: `result.${index}`, mediaType: "AUDIO", status: "AVAILABLE", mimeType, storageKey: key } });
    const response = await request(`/${logId("image")}/assets/${asset.id}/file`);
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /outside-sensitive-file|outside\.mp3|old\.invalid/);
  }
});
