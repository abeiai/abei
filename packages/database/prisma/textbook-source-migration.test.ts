import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "运行教材来源迁移测试前必须配置 DATABASE_URL");

const schemaName = `textbook_source_${randomUUID().replaceAll("-", "")}`;
const client = new Client({ connectionString: databaseUrl });
const migrationUrl = new URL(
  "./migrations/20260809113000_textbook_source_url/migration.sql",
  import.meta.url
);

test("迁移显式声明事务边界", async () => {
  const migrationSql = await readFile(migrationUrl, "utf8");

  assert.match(migrationSql, /^BEGIN;\n[\s\S]*\nCOMMIT;\s*$/);
});

before(async () => {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query("SELECT set_config('search_path', $1, false)", [schemaName]);
  await client.query(`CREATE TABLE "learning_material_textbooks" ("slug" TEXT NOT NULL)`);
  await client.query(
    `INSERT INTO "learning_material_textbooks" ("slug") VALUES
      ('smartedu-5f380546-7207-4ac7-b3e0-1f66dc9fd575'),
      ('smartedu-e1178bcd-d340-41d5-b175-e86a02d9dafa'),
      ('manual-textbook')`
  );
});

after(async () => {
  await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await client.end();
});

test("迁移只回填合法 SmartEdu slug 并创建来源唯一约束", async () => {
  await client.query(await readFile(migrationUrl, "utf8"));
  const result = await client.query(
    `SELECT "slug", "sourceUrl" FROM "learning_material_textbooks" ORDER BY "slug"`
  );

  assert.deepEqual(result.rows, [
    { slug: "manual-textbook", sourceUrl: null },
    {
      slug: "smartedu-5f380546-7207-4ac7-b3e0-1f66dc9fd575",
      sourceUrl:
        "https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=5f380546-7207-4ac7-b3e0-1f66dc9fd575&catalogType=tchMaterial&subCatalog=tchMaterial"
    },
    {
      slug: "smartedu-e1178bcd-d340-41d5-b175-e86a02d9dafa",
      sourceUrl:
        "https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=e1178bcd-d340-41d5-b175-e86a02d9dafa&catalogType=tchMaterial&subCatalog=tchMaterial"
    }
  ]);

  await assert.rejects(
    client.query(
      `INSERT INTO "learning_material_textbooks" ("slug", "sourceUrl") VALUES ($1, $2)`,
      ["duplicate-source", result.rows[1].sourceUrl]
    ),
    (error: unknown) => (error as { code?: string }).code === "23505"
  );
});

test("迁移后续步骤失败时回滚已添加字段和回填数据", async () => {
  const rollbackSchema = `textbook_source_rollback_${randomUUID().replaceAll("-", "")}`;
  const rollbackClient = new Client({ connectionString: databaseUrl });

  await rollbackClient.connect();

  try {
    await rollbackClient.query(`CREATE SCHEMA "${rollbackSchema}"`);
    await rollbackClient.query("SELECT set_config('search_path', $1, false)", [rollbackSchema]);
    await rollbackClient.query(`CREATE TABLE "learning_material_textbooks" ("slug" TEXT NOT NULL)`);
    await rollbackClient.query(
      `INSERT INTO "learning_material_textbooks" ("slug") VALUES
        ('smartedu-5f380546-7207-4ac7-b3e0-1f66dc9fd575')`
    );

    const migrationSql = await readFile(migrationUrl, "utf8");
    const failingMigrationSql = migrationSql.replace(
      /CREATE UNIQUE INDEX[\s\S]+?ON "learning_material_textbooks"\("sourceUrl"\);/,
      "SELECT missing_transaction_guard;"
    );

    await assert.rejects(rollbackClient.query(failingMigrationSql));
    await rollbackClient.query("ROLLBACK");

    const result = await rollbackClient.query(
      `SELECT COUNT(*)::int AS count
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = 'learning_material_textbooks'
         AND column_name = 'sourceUrl'`,
      [rollbackSchema]
    );

    assert.equal(result.rows[0]?.count, 0);
  } finally {
    await rollbackClient.query(`DROP SCHEMA IF EXISTS "${rollbackSchema}" CASCADE`);
    await rollbackClient.end();
  }
});
