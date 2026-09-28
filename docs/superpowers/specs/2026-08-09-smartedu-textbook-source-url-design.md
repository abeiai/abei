# SmartEdu 教材来源网址设计

## 目标

为数据库中的电子教材建立可查询、可校验的国家中小学智慧教育平台来源网址，并在教材详情页向用户展示来源链接。

本地数据库与 SmartEdu 当前电子教材数据已经核对：双方均为 2,714 条，数据库 `slug` 中的 SmartEdu `contentId` 与来源数据 ID 集合完全一致，缺失和多余均为 0。因此本次使用 `contentId` 精确关联，不做标题、年级或版本模糊匹配。

## 数据模型

在 `LearningMaterialTextbook` 增加：

```prisma
sourceUrl String? @unique
```

字段保持可空，以兼容未来手工录入或来自其他平台的教材；唯一约束防止同一个 SmartEdu 教材页面绑定到多条记录。本次不新增 `sourcePlatform` 和 `sourceResourceId`，因为现有 `slug` 已稳定包含 `smartedu-<contentId>`，额外字段会重复存储当前没有消费者的数据。

`sourceUrl` 由导入和迁移流程管理，暂不开放后台手工编辑入口。

## URL 规则

SmartEdu 教材来源网址统一生成成以下格式：

```text
https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=<contentId>&catalogType=tchMaterial&subCatalog=tchMaterial
```

生成逻辑集中在数据库包中的纯函数，输入 SmartEdu `contentId`，输出完整 URL。函数使用 `URL` 和 `URLSearchParams` 生成查询参数，不手工拼接未经编码的值。

## 存量迁移

迁移只新增字段、回填数据和创建唯一索引，不删除或重建教材记录，不修改 PDF、Markdown、封面和关联闪卡数据。

回填范围限定为符合以下格式的 slug：

```text
smartedu-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

迁移从 slug 去掉 `smartedu-` 前缀得到 `contentId`，按统一规则生成 `sourceUrl`。迁移完成后应满足：

- 教材总量仍为 2,714。
- `sourceUrl` 非空数量为 2,714。
- `sourceUrl` 去重数量为 2,714。
- 每条 URL 中的 `contentId` 与对应 slug 一致。

生产环境只执行 `prisma migrate deploy`，不得重置数据库或删除 PostgreSQL、Redis volume。

## 导入流程

`import-smartedu-textbooks.ts` 在转换 SmartEdu 资源时调用统一 URL 生成函数，并把结果写入 `sourceUrl`。这样未来重新生成导入数据时仍保留来源对应关系。

本次迁移不运行现有全量 `deleteMany` 导入流程，避免覆盖已有 PDF、Markdown、封面和转换状态；存量数据由 SQL 原地回填。

## API 与页面

公共教材列表、教材详情和 Markdown 阅读接口所使用的教材对象增加：

```ts
sourceUrl: string | null
```

教材详情页在基本信息下方显示一个低强调度的外部链接：

```text
来源：国家中小学智慧教育平台
```

链接使用外链图标、新窗口打开，并设置 `target="_blank"` 与 `rel="noreferrer"`。列表卡片和筛选结果不展示来源，避免增加检索界面的视觉噪声。

教材详情页的 `Book` JSON-LD 在 `sourceUrl` 存在时增加 `sameAs`，指向对应 SmartEdu 教材页；站内教材详情页仍保持当前 canonical URL。

## 校验与错误处理

- URL 生成函数拒绝空 contentId。
- 导入数据缺少资源 ID 时直接失败，不生成不可追踪记录。
- API 对没有来源网址的非 SmartEdu 教材返回 `sourceUrl: null`。
- 页面仅在 `sourceUrl` 存在且为 `https://basic.smartedu.cn/` 地址时展示外链。
- 迁移 SQL 只处理合法 SmartEdu UUID slug，其余记录保持 `NULL`。

## 测试与验收

实施采用测试先行：

1. 数据库包测试 URL 生成格式、查询参数和值编码，以及空 ID 拒绝行为。
2. 迁移测试检查字段、唯一索引、合法 slug 回填和非 SmartEdu slug 保持空值。
3. API 测试检查公共教材对象返回 `sourceUrl`。
4. Web 测试检查详情页来源链接文案、外链属性和 JSON-LD `sameAs`。
5. 运行 `pnpm --filter @xueleai/database test`、`pnpm --filter @xueleai/api-core test`、`pnpm --filter @xueleai/web test`，并分别运行三个包的 `typecheck`。
6. 部署后复验生产数据库 2,714 条对应关系、公共 API、教材详情页 HTML，以及项目规定的两个健康检查接口。

## 非目标

- 不再获取、刷新或保存 SmartEdu 登录令牌。
- 不使用 SmartEdu 私有 PDF 存储地址。
- 不修改现有 PDF、Markdown、封面 CDN 逻辑。
- 不新增多来源平台抽象或来源管理后台。
- 不改变教材 slug 和站内 URL。
