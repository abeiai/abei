# SmartEdu Textbook Source URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将数据库中的 2,714 条电子教材按现有 `smartedu-<contentId>` 精确绑定到国家中小学智慧教育平台教材详情页，并通过公共 API 和教材详情页公开该来源。

**Architecture:** 在数据库包中集中生成 SmartEdu 详情 URL；Prisma 迁移从合法 SmartEdu slug 原地回填 `sourceUrl` 并建立可空唯一约束；API 的统一教材投影透传该字段；Web 端只在 URL 通过 SmartEdu 域名和参数校验后显示外链，并将同一地址写入 Book JSON-LD 的 `sameAs`。不重新导入教材，不访问私有 PDF 地址，不修改 PDF、Markdown、封面或关联闪卡数据。

**Tech Stack:** Prisma 7、PostgreSQL、NestJS、Next.js App Router、TypeScript、React 19、Node test runner、Tailwind CSS、lucide-react

## Global Constraints

- 当前工作区已有与本功能无关的未提交改动；不得清理、覆盖或顺带提交这些改动。
- `packages/database/prisma/import-smartedu-textbooks.ts` 已包含此前的年级规范化修改；只暂存本计划新增的来源 URL import 和 `sourceUrl` 字段代码块。
- 存量数据只能通过新增迁移原地更新；禁止运行 `textbooks:import-smartedu`，因为该脚本会先执行 `deleteMany()`。
- 生产数据库只运行 `prisma migrate deploy`；禁止 `prisma migrate reset`，禁止删除 PostgreSQL 或 Redis volume。
- 不新增后台编辑字段，不获取 SmartEdu 登录令牌，不恢复 PDF 下载能力。
- 每个任务遵循 RED-GREEN-REFACTOR；先观察测试因缺少行为而失败，再写最小实现。
- 每次提交前检查 `git diff --cached`，确保提交中没有教材 PDF、Markdown、本地资产、备份、密钥、证书或真实环境变量。

---

### Task 1: 建立唯一的 SmartEdu 来源 URL 生成器

**Files:**
- Create: `packages/database/prisma/textbook-source-url.ts`
- Create: `packages/database/prisma/textbook-source-url.test.ts`

- [ ] **Step 1: 写 URL 生成行为测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { smartEduTextbookSourceUrl } from "./textbook-source-url.js";

test("根据 contentId 生成规范的 SmartEdu 教材详情地址", () => {
  const contentId = "5f380546-7207-4ac7-b3e0-1f66dc9fd575";
  const value = smartEduTextbookSourceUrl(contentId);
  const url = new URL(value);

  assert.equal(url.origin, "https://basic.smartedu.cn");
  assert.equal(url.pathname, "/tchMaterial/detail");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    contentType: "assets_document",
    contentId,
    catalogType: "tchMaterial",
    subCatalog: "tchMaterial"
  });
  assert.equal(
    value,
    "https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=5f380546-7207-4ac7-b3e0-1f66dc9fd575&catalogType=tchMaterial&subCatalog=tchMaterial"
  );
});

test("通过 URLSearchParams 编码 contentId", () => {
  const url = new URL(smartEduTextbookSourceUrl("教材 / 1"));
  assert.equal(url.searchParams.get("contentId"), "教材 / 1");
});

test("拒绝空 contentId", () => {
  assert.throws(() => smartEduTextbookSourceUrl("  "), /contentId 不能为空/u);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
pnpm --filter @xueleai/database exec node --import tsx --test prisma/textbook-source-url.test.ts
```

Expected: FAIL，提示找不到 `textbook-source-url.js` 或导出不存在。

- [ ] **Step 3: 实现 URL 生成器**

```ts
const smartEduOrigin = "https://basic.smartedu.cn";

export function smartEduTextbookSourceUrl(contentId: string): string {
  const normalizedContentId = contentId.trim();

  if (!normalizedContentId) {
    throw new Error("SmartEdu 教材 contentId 不能为空");
  }

  const url = new URL("/tchMaterial/detail", smartEduOrigin);
  url.searchParams.set("contentType", "assets_document");
  url.searchParams.set("contentId", normalizedContentId);
  url.searchParams.set("catalogType", "tchMaterial");
  url.searchParams.set("subCatalog", "tchMaterial");

  return url.toString();
}
```

- [ ] **Step 4: 运行测试并确认 GREEN**

Run:

```bash
pnpm --filter @xueleai/database exec node --import tsx --test prisma/textbook-source-url.test.ts
```

Expected: 3 tests PASS。

- [ ] **Step 5: 提交本任务**

```bash
git add packages/database/prisma/textbook-source-url.ts packages/database/prisma/textbook-source-url.test.ts
git diff --cached --check
git diff --cached
git commit -m "feat: add SmartEdu textbook source URL builder"
```

---

### Task 2: 新增字段、执行原地回填并更新未来导入

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260809113000_textbook_source_url/migration.sql`
- Create: `packages/database/prisma/textbook-source-migration.test.ts`
- Modify: `packages/database/prisma/import-smartedu-textbooks.ts`

- [ ] **Step 1: 写执行真实迁移 SQL 的隔离数据库测试**

测试创建独立 PostgreSQL schema，只建迁移所需的最小表，执行实际 `migration.sql`，然后断言合法 slug 被回填、非 SmartEdu slug 保持空值、唯一索引生效。测试结束必须 `DROP SCHEMA ... CASCADE`。

```ts
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
      sourceUrl: "https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=5f380546-7207-4ac7-b3e0-1f66dc9fd575&catalogType=tchMaterial&subCatalog=tchMaterial"
    },
    {
      slug: "smartedu-e1178bcd-d340-41d5-b175-e86a02d9dafa",
      sourceUrl: "https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=e1178bcd-d340-41d5-b175-e86a02d9dafa&catalogType=tchMaterial&subCatalog=tchMaterial"
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
```

- [ ] **Step 2: 运行迁移测试并确认 RED**

Run:

```bash
pnpm --filter @xueleai/database exec node --import tsx --test prisma/textbook-source-migration.test.ts
```

Expected: FAIL，实际迁移文件尚不存在。

- [ ] **Step 3: 在 Prisma 模型增加可空唯一字段**

在 `LearningMaterialTextbook` 的 `coverUrl` 附近加入：

```prisma
sourceUrl String? @unique
```

- [ ] **Step 4: 编写原地回填迁移**

```sql
ALTER TABLE "learning_material_textbooks"
ADD COLUMN "sourceUrl" TEXT;

UPDATE "learning_material_textbooks"
SET "sourceUrl" =
  'https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=' ||
  substring("slug" FROM 10) ||
  '&catalogType=tchMaterial&subCatalog=tchMaterial'
WHERE "slug" ~ '^smartedu-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

CREATE UNIQUE INDEX "learning_material_textbooks_sourceUrl_key"
ON "learning_material_textbooks"("sourceUrl");
```

- [ ] **Step 5: 更新未来 SmartEdu 导入映射**

在 `import-smartedu-textbooks.ts` 保留现有年级规范化代码，只增加：

```ts
import { smartEduTextbookSourceUrl } from "./textbook-source-url.js";
```

以及 `toTextbookCreateInput` 返回对象中的：

```ts
sourceUrl: smartEduTextbookSourceUrl(resource.id),
```

- [ ] **Step 6: 生成 Prisma Client 并运行数据库包测试**

Run:

```bash
pnpm --filter @xueleai/database db:generate
pnpm --filter @xueleai/database test
pnpm --filter @xueleai/database typecheck
```

Expected: 全部 PASS，迁移测试证明实际 SQL 可执行且唯一约束生效。

- [ ] **Step 7: 将迁移应用到本地数据库并验证 2,714 条精确对应**

Run:

```bash
pnpm db:migrate:deploy
docker compose -p xueleai exec -T postgres \
  psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -U xueleai -d xueleai -p 3324 <<'SQL'
SELECT
  count(*),
  count("sourceUrl"),
  count(DISTINCT "sourceUrl"),
  count(*) FILTER (
    WHERE "sourceUrl" IS NULL OR "sourceUrl" <>
      'https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=' ||
      substring("slug" FROM 10) ||
      '&catalogType=tchMaterial&subCatalog=tchMaterial'
  )
FROM "learning_material_textbooks";
SQL
```

Expected:

```text
2714|2714|2714|0
```

若任一数字不符，停止，不运行导入脚本，先检查 slug 数据与迁移状态。

- [ ] **Step 8: 只提交本任务相关变更**

```bash
git add packages/database/prisma/schema.prisma \
  packages/database/prisma/migrations/20260809113000_textbook_source_url/migration.sql \
  packages/database/prisma/textbook-source-migration.test.ts
git add -p packages/database/prisma/import-smartedu-textbooks.ts
git diff --cached --check
git diff --cached
git commit -m "feat: map textbooks to SmartEdu source pages"
```

在 `git add -p` 中只选择 `smartEduTextbookSourceUrl` 的 import 和 `sourceUrl` 赋值，不选择此前的年级规范化改动。

---

### Task 3: 通过公共教材 API 输出来源地址

**Files:**
- Create: `apps/api-core/tests/learning-materials-source-url.test.ts`
- Modify: `apps/api-core/src/learning-materials/learning-materials.service.ts`

- [ ] **Step 1: 写公共教材投影测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { LearningMaterialsService } from "../src/learning-materials/learning-materials.service.js";

const sourceUrl = "https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=5f380546-7207-4ac7-b3e0-1f66dc9fd575&catalogType=tchMaterial&subCatalog=tchMaterial";

function serviceFixture(value: string | null) {
  const textbook = {
    id: "textbook-1",
    slug: "smartedu-5f380546-7207-4ac7-b3e0-1f66dc9fd575",
    title: "道德与法治五年级上册",
    educationType: "PRIMARY" as const,
    subject: "道德与法治",
    version: "统编版",
    grade: "五年级",
    volume: "FIRST_VOLUME" as const,
    curriculumStandardYear: "2022",
    editionYear: null,
    publisher: null,
    coverUrl: null,
    sourceUrl: value,
    pdfUrl: null,
    pdfObjectKey: null,
    backupPdfUrl: null,
    backupPdfPath: null,
    markdownContent: null,
    markdownConversionStatus: "PENDING",
    markdownConvertedAt: null,
    markdownPageCount: null,
    mdUrl: null,
    mdObjectKey: null,
    sortOrder: 1,
    updatedAt: new Date("2026-08-09T00:00:00.000Z")
  };
  const prisma = {
    learningMaterialTextbook: {
      findFirst: async () => textbook
    }
  };
  const service = new LearningMaterialsService();
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });
  return service;
}

test("公共教材详情返回 SmartEdu 来源地址", async () => {
  const textbook = await serviceFixture(sourceUrl).getPublicTextbook("textbook-1");
  assert.equal(textbook.sourceUrl, sourceUrl);
});

test("非 SmartEdu 教材返回空来源地址", async () => {
  const textbook = await serviceFixture(null).getPublicTextbook("textbook-1");
  assert.equal(textbook.sourceUrl, null);
});
```

- [ ] **Step 2: 运行 API 测试并确认 RED**

Run:

```bash
pnpm --filter @xueleai/api-core test
```

Expected: 新测试 FAIL，`sourceUrl` 当前为 `undefined`。

- [ ] **Step 3: 扩展统一教材投影**

在 `toTextbook` 的输入类型加入：

```ts
sourceUrl: string | null;
```

在返回对象加入：

```ts
sourceUrl: textbook.sourceUrl,
```

公共列表、详情和 Markdown 接口都会继续复用同一投影，不在 controller 中重复拼装。

- [ ] **Step 4: 运行 API 测试与类型检查并确认 GREEN**

Run:

```bash
pnpm --filter @xueleai/api-core test
pnpm --filter @xueleai/api-core typecheck
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交本任务**

```bash
git add apps/api-core/tests/learning-materials-source-url.test.ts \
  apps/api-core/src/learning-materials/learning-materials.service.ts
git diff --cached --check
git diff --cached
git commit -m "feat: expose textbook source URLs"
```

---

### Task 4: 在教材详情页显示安全来源链接与 JSON-LD

**Files:**
- Create: `apps/web/src/lib/textbook-source.ts`
- Create: `apps/web/src/components/textbook/textbook-source-link.tsx`
- Create: `apps/web/tests/textbook-source.test.ts`
- Modify: `apps/web/src/lib/textbook-public-api.ts`
- Modify: `apps/web/src/app/textbook/[...segments]/page.tsx`

- [ ] **Step 1: 写 URL 白名单、来源组件和结构化数据测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TextbookSourceLink } from "../src/components/textbook/textbook-source-link.js";
import {
  getSmartEduTextbookSourceUrl,
  textbookSourceSameAs
} from "../src/lib/textbook-source.js";

const sourceUrl = "https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=5f380546-7207-4ac7-b3e0-1f66dc9fd575&catalogType=tchMaterial&subCatalog=tchMaterial";

test("只接受规范的 SmartEdu 教材详情地址", () => {
  assert.equal(getSmartEduTextbookSourceUrl(sourceUrl), sourceUrl);
  assert.equal(getSmartEduTextbookSourceUrl(sourceUrl.replace("https:", "http:")), null);
  assert.equal(getSmartEduTextbookSourceUrl(sourceUrl.replace("basic.smartedu.cn", "example.com")), null);
  assert.equal(getSmartEduTextbookSourceUrl("https://basic.smartedu.cn/tchMaterial/detail"), null);
  assert.equal(getSmartEduTextbookSourceUrl(null), null);
});

test("来源链接使用新窗口和 noreferrer", () => {
  const runtime = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtime.React;
  runtime.React = React;
  let html: string;

  try {
    html = renderToStaticMarkup(React.createElement(TextbookSourceLink, { sourceUrl }));
  } finally {
    runtime.React = previousReact;
  }

  assert.match(html, /来源：国家中小学智慧教育平台/u);
  assert.match(html, /target="_blank"/u);
  assert.match(html, /rel="noreferrer"/u);
  assert.match(html, /basic\.smartedu\.cn/u);
});

test("非法来源不渲染且不写入 Book sameAs", () => {
  assert.equal(renderToStaticMarkup(React.createElement(TextbookSourceLink, { sourceUrl: "https://example.com" })), "");
  assert.deepEqual(textbookSourceSameAs("https://example.com"), {});
  assert.deepEqual(textbookSourceSameAs(sourceUrl), { sameAs: sourceUrl });
});
```

- [ ] **Step 2: 运行 Web 测试并确认 RED**

Run:

```bash
pnpm --filter @xueleai/web test
```

Expected: FAIL，来源 helper 和组件尚不存在。

- [ ] **Step 3: 实现严格 SmartEdu URL 校验和 JSON-LD 投影**

`textbook-source.ts` 必须检查：HTTPS、主机 `basic.smartedu.cn`、路径 `/tchMaterial/detail`、`contentType=assets_document`、合法 UUID `contentId`、两个 catalog 参数均为 `tchMaterial`。接口如下：

```ts
export function getSmartEduTextbookSourceUrl(value: string | null | undefined): string | null;

export function textbookSourceSameAs(
  value: string | null | undefined
): { sameAs?: string };
```

不得仅使用 `startsWith` 校验域名。

- [ ] **Step 4: 实现低强调度来源链接组件**

组件使用 lucide-react 的 `ExternalLink` 图标，安全 URL 不存在时返回 `null`：

```tsx
<a
  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
  href={safeSourceUrl}
  rel="noreferrer"
  target="_blank"
>
  来源：国家中小学智慧教育平台
  <ExternalLink aria-hidden="true" className="size-3.5" />
</a>
```

- [ ] **Step 5: 更新公共类型并接入详情页**

在 `PublicTextbookListItem` 加入：

```ts
sourceUrl: string | null;
```

在详情页 `TextbookInfoTable` 下方渲染：

```tsx
<TextbookSourceLink sourceUrl={textbook.sourceUrl} />
```

在 Book JSON-LD 对象中展开：

```ts
...textbookSourceSameAs(textbook.sourceUrl),
```

保持站内 canonical、PDF CDN 和 Markdown 阅读逻辑不变。

- [ ] **Step 6: 运行 Web 测试、类型检查和构建并确认 GREEN**

Run:

```bash
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/web build
```

Expected: 全部 PASS；Next.js 详情路由可构建。

- [ ] **Step 7: 启动本地页面并做可见验收**

如果 `3321` 尚无开发服务器：

```bash
pnpm --filter @xueleai/web dev
```

打开：

```text
http://127.0.0.1:3321/textbook/smartedu-5f380546-7207-4ac7-b3e0-1f66dc9fd575
```

验收：基本信息下方出现“来源：国家中小学智慧教育平台”；点击在新标签页打开对应 SmartEdu 页面；页面没有新增 PDF 下载入口；布局在桌面和移动视口均无重叠。

- [ ] **Step 8: 提交本任务**

```bash
git add apps/web/src/lib/textbook-source.ts \
  apps/web/src/components/textbook/textbook-source-link.tsx \
  apps/web/tests/textbook-source.test.ts \
  apps/web/src/lib/textbook-public-api.ts \
  'apps/web/src/app/textbook/[...segments]/page.tsx'
git diff --cached --check
git diff --cached
git commit -m "feat: show official textbook source links"
```

---

### Task 5: 全量验真、独立审查与生产发布

**Files:**
- Verify only;修复审查发现的问题时仅修改 Task 1-4 已列文件。

- [ ] **Step 1: 检查改动边界和敏感文件**

Run:

```bash
git status --short
git diff --stat 5101667^..HEAD
git log --oneline --decorate -8
```

Expected: 功能提交只包含 schema、迁移、数据库测试/生成器、API 投影/测试、Web 类型/helper/组件/页面/测试和两份设计文档；不包含 PDF、Markdown、本地资产、`.env`、`.pem`、证书或备份。

- [ ] **Step 2: 运行全量验证**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: 全部退出码为 0。不得用重复运行掩盖首次失败；先记录并修复根因。

- [ ] **Step 3: 请求独立代码审查**

使用 `superpowers:requesting-code-review`，审查范围为设计提交 `5101667` 至当前 HEAD，重点检查：

- SQL 回填是否严格限定合法 SmartEdu UUID slug。
- 唯一索引和可空字段是否兼容非 SmartEdu 教材。
- API 是否统一返回 `sourceUrl`，且不泄露任何令牌或私有 PDF 地址。
- Web 是否严格校验主机和参数，外链属性及 JSON-LD 是否正确。
- 是否误改现有 PDF、Markdown、封面和年级规范化逻辑。

有发现时先补失败测试，再修复并重新运行受影响验证；无发现后继续。

- [ ] **Step 4: 在干净发布工作树合并本功能提交并复验**

从最新 `origin/main` 创建干净发布工作树，逐个 cherry-pick 设计、计划和实现提交，避免当前脏工作区中的无关改动进入发布：

```bash
git fetch origin
SOURCE_COMMITS="$(git rev-list --reverse 5101667^..HEAD)"
git worktree add /tmp/xueleai-smartedu-source-release -b codex/smartedu-textbook-source-release origin/main
git -C /tmp/xueleai-smartedu-source-release cherry-pick ${SOURCE_COMMITS}
pnpm --dir /tmp/xueleai-smartedu-source-release install --frozen-lockfile
pnpm --dir /tmp/xueleai-smartedu-source-release test
pnpm --dir /tmp/xueleai-smartedu-source-release typecheck
pnpm --dir /tmp/xueleai-smartedu-source-release build
```

执行 cherry-pick 前必须先通过 Step 1 的日志确认 `5101667^..HEAD` 只包含本功能的设计、计划和实现提交；如混入其他提交，停止并改用已审查的明确 SHA 列表。

- [ ] **Step 5: 发布 GitHub main 并确认远端指针**

```bash
git -C /tmp/xueleai-smartedu-source-release push origin HEAD:main
git ls-remote origin refs/heads/main
git -C /tmp/xueleai-smartedu-source-release rev-parse HEAD
```

Expected: `git ls-remote` 的 SHA 与干净发布工作树 HEAD 完全一致。此时只能报告“GitHub 已发布”。

- [ ] **Step 6: 通过项目发布脚本部署服务器**

在干净发布工作树执行：

```bash
cd /tmp/xueleai-smartedu-source-release
SERVER_HOST=8.130.169.220 \
SSH_KEY=/Users/ericword/xueleai/xueleai.com.pem \
pnpm release:server
```

发布脚本必须保留服务器 `/opt/xueleai/.env.production`、`deploy/data/`、`deploy/certs/`，并由生产 Compose 执行 `prisma migrate deploy`。若 GitHub 指针、迁移或健康检查失败，停止并明确报告线上发布未完成。

- [ ] **Step 7: 复验线上数据库、API 和页面**

数据库检查通过 SSH 在生产 PostgreSQL 容器中执行：

```bash
ssh -i /Users/ericword/xueleai/xueleai.com.pem root@8.130.169.220 bash -s <<'REMOTE'
set -euo pipefail
cd /opt/xueleai
docker compose -p xueleai-prod --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres sh -lc \
  'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -qAt -F "|" -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -p 3327' <<'SQL'
SELECT
  count(*),
  count("sourceUrl"),
  count(DISTINCT "sourceUrl"),
  count(*) FILTER (
    WHERE "sourceUrl" IS NULL OR "sourceUrl" <>
      'https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=' ||
      substring("slug" FROM 10) ||
      '&catalogType=tchMaterial&subCatalog=tchMaterial'
  )
FROM "learning_material_textbooks";
SQL
REMOTE
```

Expected: `2714|2714|2714|0`。随后运行：

```bash
curl -fsS https://xueleai.com/api/health
curl -fsS https://xueleai.com/api/system-config/public
curl -fsS https://xueleai.com/api/public/textbooks/smartedu-5f380546-7207-4ac7-b3e0-1f66dc9fd575
curl -fsS https://xueleai.com/textbook/smartedu-5f380546-7207-4ac7-b3e0-1f66dc9fd575
```

验收：

- API 返回 `code: 0` 且 `data.sourceUrl` 为规范 SmartEdu 地址。
- 页面 HTML 包含“来源：国家中小学智慧教育平台”和该 URL。
- Book JSON-LD 包含同一 `sameAs`。
- 两个项目规定的健康接口成功。
- 页面仍只使用 `cdn.xueleai.com` 的 PDF/Markdown/封面资源，不出现 SmartEdu 私有 PDF 存储地址。

- [ ] **Step 8: 清理临时发布工作树**

```bash
git worktree remove /tmp/xueleai-smartedu-source-release
git branch -d codex/smartedu-textbook-source-release
```

只有 GitHub、服务器、线上 API、线上页面和 2,714 条生产数据校验全部通过，才报告“线上发布成功”。
