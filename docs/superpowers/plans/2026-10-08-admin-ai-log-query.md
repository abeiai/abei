# 后台 AI 日志查询实施计划

> **For agentic workers:** 使用 superpowers:executing-plans 在当前会话实现，最后进行独立代码审查。步骤用勾选项记录。

**Goal:** 后台提供对话、图片、语音、视频日志查询，支持新版任务和后续导入的旧版档案。

**Architecture:** `/admin/ai-logs` 提供新版/旧版来源选择。新版复用现有任务列表和详情；旧版使用独立历史会话、日志、有序明细和素材引用，只提供管理员读取 API。历史素材经管理员鉴权从独立私有目录读取，不把源端 URL 或凭据交给浏览器。

**Tech Stack:** Next.js、NestJS、Prisma、PostgreSQL。

**Spec:** [旧版导出方案 5.4](../../legacy-data-export-plan.md#54-旧后台四类日志)。用户已要求实现新版后台日志查询，本次执行该查询部分。

## 全局约束

- 允许修改 `packages/database`、`apps/api-core/src/operations`、`apps/api-core/src/ai/ai.service.ts` 的后台类型分页查询、`apps/web` 后台页面/导航/helper、必要的 abei Docker 配置及测试和本计划。
- 旧版代码、线上数据、支付/钱包/任务执行和旧服务配置不修改；不执行真实旧数据导入。
- 使用 abei 专属资源和 3600–3680 端口。开发复用附属隔离工作区；测试数据库/Redis 使用临时 3606/3607，API 测试使用 3608。
- 新增历史档案 migration；无需 seed。归档来源唯一，用户允许为空；会话明细可引用同一片段，但不能跨用户开放素材。
- 列表不载入全文；详情凭管理员会话查询且不缓存。JSON 凭据字段及文本中的明显凭据必须脱敏，文本以纯文本呈现。
- 对不存在、非法筛选或不安全素材返回中文错误。无真实旧数据时显示空状态，不生成演示历史记录。

## 审查重点

- 普通用户 Cookie、失效/禁用管理员和直接素材请求均不能取得私人日志。
- 日期按上海自然日、结束日包含全天；非法日期、超大页码和重复参数不能形成无限查询。
- 空用户、未知状态、重复来源和同一时间的记录可稳定查询；正文/密钥不进入列表或终端日志。
- 历史素材路径穿越、符号链接和不安全 MIME 不可访问；音视频 Range 请求正常，不跟随旧 URL 读取线上数据。
- 新版来源筛选和分页始终停留在日志入口；旧版归档不影响任务队列、余额、用量或告警。

## 任务 1 历史结构和管理员查询 API

**Files:** `packages/database/prisma/schema.prisma`、新 migration；`apps/api-core/src/operations/legacy-ai-logs.*`；`operations.module.ts`；`apps/api-core/tests/legacy-ai-logs*.test.ts`；`docker-compose.yml` 和环境示例中的私有素材目录。

**Interfaces:** `GET /api/admin/legacy-ai-logs` 返回 `{items,total,page,pageSize}`，接受 `kind/status/user/model/application/sourceId/startDate/endDate/page`；`GET /:id` 返回正文、业务参数、有序会话和素材；`GET /:id/assets/:assetId/file` 返回管理员保护的媒体文件。

- [x] 先写真实管理员/普通用户/未登录路由测试；当前路由缺失时确认返回 404。
- [x] 建立 `LegacyAiSession/LegacyAiLog/LegacyAiSessionItem/LegacyAiLogAsset`，来源三元组唯一，外键和索引明确；只在临时测试库应用 migration。
- [x] 写并验证失败测试：四类筛选、源用户/日期/模型/状态、稳定分页、全文不在列表、凭据脱敏、缺失详情、会话顺序及跨用户片段隔离。
- [x] 实现只读查询和详情；不调用现有任务执行、统计或结算服务。
- [x] 写并验证失败测试：受保护媒体、路径穿越/符号链接、缺失文件、不安全 MIME、Range/416。
- [x] 实现私有文件读取，固定响应头及边界校验；素材实际导入另行执行。
- [x] 运行针对性测试和类型/构建检查，提交 backend/schema 变更。

## 任务 2 后台查询页面和导航

**Files:** `apps/web/src/app/admin/ai-logs`、`components/admin` 中可复用的任务列表、`lib/legacy-ai-logs-api.ts`、`lib/mock-data.ts` 导航；相应 Web 测试。

**Interfaces:** `/admin/ai-logs?source=NEW|LEGACY`；旧版详情 `/admin/ai-logs/legacy/:id`；新版详情复用现有 `/admin/ai-tasks/:id`、`/admin/audio/tasks/:id`。

- [x] 测试筛选链接/来源/分页保留与媒体响应映射，先看到新 helper 行为缺失的失败。
- [x] 提取现有任务列表为后台共享组件，保留原路由行为；日志入口提供来源切换及四类查询。
- [x] 实现旧版列表、详情、会话顺序、参数、图片/音视频预览和缺失反馈；空状态明确。
- [x] 执行 Web 全量测试、相关 lint/typecheck/build；执行必要 API 回归并记录基线失败。
- [x] 独立审查后修复重要问题；在隔离库验证详情与权限。
- [ ] 将已验收提交带回当前分支，只在本地 abei 应用新增 migration、更新 API/Web；浏览器验收后台入口，提交完成记录。

## 验收

- 单元/集成：隔离工作区的 API/Web 测试、数据库 schema validate、typecheck、build 和改动范围 lint。
- 浏览器：本地 `/admin/ai-logs`，新版已有记录可查，四类旧日志查询空状态正确；协议夹具只在临时测试库验收，不写入本地业务库作为真实历史。
- 完成报告区分“查询功能已可用”和“旧数据尚未导入”，不宣称已迁入旧日志。

## 审查处理与已完成验证（2026-10-08）

- 独立只读审查范围 `c68c212..5f700d6`，没有 Critical；两项 Important 已修复：Basic/Cookie/正文 JSON 凭据遗漏及旧 URL 从参数/正文透出。4 个合成回归测试先失败后通过；HTTP 测试补充列表、嵌套参考图、音视频输出的脱敏断言。浏览器只提供后台保护素材路径，原始链接由受限导出包保留。
- Minor 已修复：公共 uploads 与私人素材目录比较真实路径，防止父目录符号链接绕过；模型关键词也搜索版本名称；本清单同步进度。
- 实际浏览器检查发现新版“重置”仍跳回任务清单，已改为保留日志入口。
- 新版类型分页消除了既有最多 1000 条内存过滤限制，改为筛选场景后由数据库分页。真实临时库测试覆盖超过 1000 条记录和混合能力场景。
- 隔离库浏览器：四类旧日志列表、图片筛选、完整对话及会话提示词、图片文件与缺失提示、音频/视频播放结束均已验收；夹具仅位于 3606 临时测试库，未写入业务数据库。
- API/Web 类型检查和构建通过；Web 563/563。API 最终全量回归 1236 条：1221 通过、9 失败、6 跳过；失败与基线一致（固定端口库守卫、R2/model fixture、tsx 模块初始化），新功能测试全部通过，不能宣称 API 全量通过。
