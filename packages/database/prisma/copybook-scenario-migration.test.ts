import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

test("补齐字帖应用且重复执行保留管理员停用和会员配置", async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "3604", "仅允许本地测试数据库");
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query('CREATE TEMP TABLE ai_scenarios (LIKE public.ai_scenarios INCLUDING ALL) ON COMMIT DROP');
    const sql = await readFile(new URL("./migrations/20260915100000_copybook_scenario/migration.sql", import.meta.url), "utf8");
    await client.query(sql);
    const { rows } = await client.query("SELECT * FROM ai_scenarios WHERE slug = 'zitie'");
    assert.equal(rows.length, 1, "字帖应用配置必须存在");
    assert.equal(rows[0].isEnabled, true);
    assert.equal(rows[0].minimumMembershipRank, 0);
    assert.equal(rows[0].costCredits, 0);
    assert.deepEqual(rows[0].requiredCapabilities, []);
    await client.query("UPDATE ai_scenarios SET \"isEnabled\" = false, \"minimumMembershipRank\" = 3, name = '自定义字帖' WHERE slug = 'zitie'");
    const before = await client.query("SELECT * FROM ai_scenarios");
    await client.query(sql);
    assert.deepEqual((await client.query("SELECT * FROM ai_scenarios")).rows, before.rows);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
