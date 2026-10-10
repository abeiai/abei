# 《我想成为》生产数据同步

2026-10-10 将《我想成为》16本职业绘本同步到独立生产实例，作者为既有账号“乐乐绘本工作室”。系列投稿保留真实审核请求 `cmv1rrh1g000x36mzkcqm6rk7`，状态 `APPROVED`；系列为 `PUBLISHED`，16个课件公开快照均为 `APPROVED`。

线上地址：[我想成为](https://new.abeiai.com/c/e2edf14f892a944946c00c80)。每本16页正文加1张书名封面，3:4；共有272个阅读画面及1张系列封面。

## 同步范围和执行方式

此次为选择性业务数据同步。修改范围为本系列同步脚本、测试及文档；业务写入仅涉及下表八张表。无需 schema、migration 或 seed 更新。

源数据在本地 `abei-api-core-1` 通过只读一致性事务导出，绑定当前已审核系列、完整书稿、16个公开快照及真实审核日志。目标使用 `/opt/abei`、`abei-prod`、`abei-prod-api-core-1`，实际数据库为 `abei:3604`，目标域名固定为 `https://new.abeiai.com`。数据包及独立运维脚本通过 SSH 私传，运行于容器临时目录。

数据包传输前后 SHA-256：`b9690595c32921dc52fdd6c1289b22a2740ba71dd77a4129d5c98a52ce3c3882`。生产实例使用自身 R2 配置签名读取全部273张选定图片，逐张核对 SHA-256、字节数、WebP 类型与尺寸后再写入。

生产原有工作室与审批管理员已存在。同步只读取并确认这些身份，不复制账号、密码、钱包、提供商配置或环境文件。源包保留当前审批请求及其原始管理员操作日志；另增加一条 `SYNC_APPROVED_CAREER_SERIES` 生产同步日志。

## 表计数

首次同步选定目标行均不存在，原子新增326行：

| 表 | 同步前 | 新增 | 同步后 |
| --- | ---: | ---: | ---: |
| media_assets | 61405 | 273 | 61678 |
| picture_books | 42928 | 16 | 42944 |
| course_material_publications | 31 | 16 | 47 |
| courses | 2 | 1 | 3 |
| course_revisions | 3 | 1 | 4 |
| course_revision_items | 34 | 16 | 50 |
| course_review_requests | 15 | 1 | 16 |
| admin_operation_logs | 214 | 2 | 216 |

事务采用串行化隔离、选定行锁、作者及审核管理员共享锁和有界重试。已有行必须逐字段一致；人工编辑、同名不同ID系列、缺失审核、独立待审/拒绝或两端字段差异都会中止，禁止覆盖线上记录。同步前后范围外八表的行摘要、工作室账号及钱包摘要保持一致。

生产实际重放同一已核验包：`changed=0`，八表新增均为0，前后计数一致，原审核与同步日志没有重复创建。

## 私有记录

服务器目录 `/opt/abei/deploy/data/career-sync/20261010-sixteen/` 权限为700，JSON文件为600，未加入Git：

- `approved-bundle.json`：选定已审核业务数据包。
- `target-before-first-apply.json`：首次写入前的选定目标、表计数及范围外/账号/钱包摘要。
- `first-apply.json`：首次新增计数和素材核验结果。
- `verification.json`：普通读者与已公开系列复验结果。
- `replay.json`：生产重复同步零写入结果。
- `health-and-page.jsonl`：线上四项健康接口、应用版本与系列页面返回结果。

## 验收

- 同步相关 `career-import`、`career-revision`、`career-expansion`、`career-production-sync` 测试共18项通过。
- 专用 PostgreSQL `abei_career_sync_test:3608` 测试3/3通过，覆盖实际事务失败回滚、重放零写入、线上冲突保护、并发首次写入仅一次成功。测试容器使用独立匿名卷，验证结束后删除。
- 审核、阅读及R2图片四个相关API测试文件：37项通过、1项专用集成测试按条件跳过。
- 独立代码审查通过，执行器与同步模块语法检查通过。
- 生产课程服务返回16个完整目录及阅读链接。普通非作者账号读取全部16本，每本17个画面，272个画面的页码、配文、图片URL与批准书稿一致，比例均为3:4。
- 线上 `/api/health`、`/api/health/db`、`/api/health/redis`、`/api/system-config/public` 均为HTTP200、`code=0`。系列页面HTTP200，正文包含系列名称、工作室作者及新增兽医篇。
- 浏览器最初的导航和DOM读取超时；改用已完成导航的页面截图成功取得完整16本目录及系列封面，截图见[线上目录](/Users/ericword/.codex/visualizations/2026/10/07/01a115a8-a071-78f2-b741-2ab38b1fae2a/career-sixteen-production-published.png)。

全量检查未全部通过：Web598项、AI Gateway50项通过；数据库151项通过、2项因旧测试只接受3604测试地址而拒绝独立3608库；API1254项通过、28项失败、6项跳过。API全量通过 `pnpm exec node --import tsx --test --test-concurrency=1 tests/*.test.ts` 在隔离测试数据库和Redis占位3609执行，避免包脚本加载本地真实环境文件。失败包括现有历史列表、语音/钱包、旧日志、Redis及缺少测试身份上下文密钥等环境/fixture问题；绘本导读库全量断言1项因同库保留同步测试的16个公开课件而得到17条结果。这些全量结果不作为通过报告，生产实际已审核目录与272个阅读画面另行通过验收。

针对上述绘本导读库和单本投稿两项失败，重新创建干净的独立3608测试库：导读库1/1通过；单本投稿最初因缺少测试JWT密钥失败，补齐仅供测试的身份上下文及JWT配置后1/1通过。未使用真实环境密钥。该复验解释了这两项环境/fixture失败，未将其余全量失败报告为已修复。

本次未运行 install、lint、typecheck 或应用build：没有应用源码、路由、依赖、数据库schema或构建配置变更，采用脚本测试、真实PostgreSQL、独立审查与生产复验。

## 发布状态

GitHub：此次无应用代码推送。服务器：选择性业务数据同步完成，私有备份与验收记录已保留。线上API与实际资源页面通过验收。应用版本仍为 `0.0.16`，release为 `f112e0b3c98da6f4a0efe3d5c1a75164449176ee`，没有将其他开发中的应用改动发布到线上。
