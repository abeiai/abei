import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("./schema.prisma", import.meta.url), "utf8");
const migrationUrl = new URL(
  "./migrations/20260808120000_wechat_oauth_login/migration.sql",
  import.meta.url
);
const migration = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const mpMigrationUrl = new URL(
  "./migrations/20260808133000_wechat_login_mp_open_id/migration.sql",
  import.meta.url
);
const mpMigration = existsSync(mpMigrationUrl)
  ? readFileSync(mpMigrationUrl, "utf8")
  : "";

test("微信双端登录保存各渠道 OpenID 并以 UnionID 唯一归一用户", () => {
  assert.match(schema, /wechatOpenId\s+String\?\s+@unique/);
  assert.match(schema, /wechatMpOpenId\s+String\?\s+@unique/);
  assert.match(schema, /wechatWebOpenId\s+String\?\s+@unique/);
  assert.match(schema, /wechatUnionId\s+String\?\s+@unique/);

  assert.match(migration, /ADD COLUMN "wechatWebOpenId" TEXT/);
  assert.match(migration, /ADD COLUMN "wechatUnionId" TEXT/);
  assert.match(migration, /CREATE UNIQUE INDEX "users_wechatWebOpenId_key"/);
  assert.match(migration, /CREATE UNIQUE INDEX "users_wechatUnionId_key"/);
  assert.match(mpMigration, /ADD COLUMN "wechatMpOpenId" TEXT/);
  assert.match(mpMigration, /CREATE UNIQUE INDEX "users_wechatMpOpenId_key"/);
});
