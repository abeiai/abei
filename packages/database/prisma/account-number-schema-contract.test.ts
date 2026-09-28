import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const schema = readFileSync(new URL("./schema.prisma", import.meta.url), "utf8");
const migrationUrl = new URL(
  "./migrations/20260826100000_account_numbers_and_learner_login/migration.sql",
  import.meta.url
);
const migration = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

test("主账号使用从 10000 开始的全局序列且子账号在主账号内使用三位编号", () => {
  assert.match(schema, /model User \{[\s\S]*accountNumber\s+Int\s+@unique\s+@default\(autoincrement\(\)\)/u);
  assert.match(schema, /model User \{[\s\S]*nextLearnerNumber\s+Int\s+@default\(100\)/u);
  assert.match(schema, /model Learner \{[\s\S]*accountNumber\s+Int[\s\S]*@@unique\(\[userId, accountNumber\]\)/u);
  assert.match(migration, /CREATE SEQUENCE "users_accountNumber_seq" START 10000/u);
});

test("账号编号迁移按创建时间稳定回填并把后续序列接在最大主账号 ID 后", async () => {
  assert.ok(migration, "账号编号迁移必须存在");
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "运行账号编号迁移测试前必须配置 DATABASE_URL");

  const client = new Client({ connectionString: databaseUrl });
  const schemaName = `account_numbers_${randomUUID().replaceAll("-", "")}`;
  const quotedSchema = `"${schemaName}"`;
  await client.connect();

  try {
    await client.query(`CREATE SCHEMA ${quotedSchema}`);
    await client.query(`SET search_path TO ${quotedSchema}`);
    await client.query(`CREATE TABLE "users" (
      "id" TEXT PRIMARY KEY,
      "createdAt" TIMESTAMP(3) NOT NULL
    )`);
    await client.query(`CREATE TABLE "learners" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL
    )`);
    await client.query(`INSERT INTO "users" ("id", "createdAt") VALUES
      ('later', '2026-01-02T00:00:00Z'),
      ('first', '2026-01-01T00:00:00Z'),
      ('empty', '2026-01-03T00:00:00Z')`);
    await client.query(`INSERT INTO "learners" ("id", "userId", "createdAt") VALUES
      ('first-second', 'first', '2026-01-01T02:00:00Z'),
      ('later-first', 'later', '2026-01-01T01:00:00Z'),
      ('first-first', 'first', '2026-01-01T01:00:00Z')`);

    await client.query(migration);

    const users = await client.query<{ id: string; accountNumber: number; nextLearnerNumber: number }>(
      `SELECT "id", "accountNumber", "nextLearnerNumber" FROM "users" ORDER BY "accountNumber"`
    );
    assert.deepEqual(users.rows, [
      { id: "first", accountNumber: 10000, nextLearnerNumber: 102 },
      { id: "later", accountNumber: 10001, nextLearnerNumber: 101 },
      { id: "empty", accountNumber: 10002, nextLearnerNumber: 100 }
    ]);

    const learners = await client.query<{ id: string; accountNumber: number }>(
      `SELECT "id", "accountNumber" FROM "learners" ORDER BY "userId", "accountNumber"`
    );
    assert.deepEqual(learners.rows, [
      { id: "first-first", accountNumber: 100 },
      { id: "first-second", accountNumber: 101 },
      { id: "later-first", accountNumber: 100 }
    ]);

    await client.query(`INSERT INTO "users" ("id", "createdAt") VALUES ('next', now())`);
    const next = await client.query<{ accountNumber: number }>(
      `SELECT "accountNumber" FROM "users" WHERE "id" = 'next'`
    );
    assert.equal(next.rows[0]?.accountNumber, 10003);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
    await client.end();
  }
});
