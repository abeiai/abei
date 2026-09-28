# AGENTS.md

## abei 项目覆盖规则

本仓库从 xueleai 的 `origin/main` 导入，作为 abei 的技术底座。下文保留上游开发约定；其中与 Docker 名称或端口冲突的规则，以本节为准。abei 的 Compose 项目名为 `abei`，入口容器名为 `abei`，Docker 服务仅使用 3600–3680 端口段：3600 HTTP、3601 Web、3602 API、3603 AI Gateway、3604 PostgreSQL、3605 Redis。不得连接或复用 xueleai 的容器、数据卷和 3320 端口段。

本文件是 Codex 在本仓库中执行开发任务时必须优先读取和遵守的全局规则。

## 1. 项目定位

本项目是一个面向中国市场的 **简体中文 AI SaaS / 内容型工具站底座**。

第一阶段目标不是一次性实现完整 AI 平台，而是尽快形成一个可访问、可登录、可管理内容、可展示前台页面的可运营基础框架。

第一阶段必须优先完成：

1. 简体中文前台网站
2. 简体中文管理后台
3. 前台用户注册、登录、退出
4. 后台管理员登录、退出
5. 简单 CMS
   - 文章分类管理
   - 文章管理
   - 单页管理
6. 基础系统配置
7. 后续预留支付宝、微信支付和 AI 点数消耗能力

---

## 2. 开发优先级

必须遵循以下顺序：

```text
可见页面 > 登录闭环 > 后台管理 > CMS 内容发布 > 支付充值 > 钱包流水 > AI 能力
```

不得长期停留在底层工程、数据库抽象、AI 网关、复杂账务等不可见模块上。  
每一批开发任务完成后，都必须能通过浏览器看到明确的页面变化或功能变化。

---

## 3. 技术栈约束

### 3.1 Monorepo

项目采用：

```text
pnpm + Monorepo Workspace
```

推荐目录结构：

```text
apps/
  web/          # Next.js 前台 + 用户中心 + 管理后台
  api-core/     # NestJS 核心业务 API
  ai-gateway/   # FastAPI AI 执行层，第一阶段只预留，可后置实现

packages/
  database/     # Prisma schema、migration、seed
  config/       # ESLint、Prettier、TSConfig 等共享配置
```

第一阶段重点开发：

```text
apps/web
apps/api-core
packages/database
packages/config
```

`apps/ai-gateway` 可以先建立空壳或 health check，但不得阻塞前后台、Auth、CMS 的开发。

---

### 3.2 前端技术栈

前端使用：

```text
Next.js App Router
TypeScript
TailwindCSS
shadcn/ui
Zustand
```

所有前端页面必须使用简体中文。

---

### 3.2.1 AI 工具工作台界面约束

前台 AI 工具、体验区、生成器类页面，如果页面同时包含“历史记录 / 主操作区 / 参数设置区”，必须优先参考 `/voice` 的工作台布局与文字规格。

桌面端默认采用三栏工作台：

```text
左栏历史记录：292px
中间主操作区：minmax(0, 1fr)
右栏参数设置：360px
栏间距：20px
页面内边距：20px
工作台背景：#f6f6f5
```

文字规格优先遵循：

```text
页面主标题：text-2xl font-semibold tracking-normal
面板标题：text-base font-semibold
表单标签：text-sm font-semibold
正文说明：text-sm leading-6 text-muted-foreground
历史分组提示：text-xs font-medium text-muted-foreground
历史项标题：text-sm font-medium
历史项辅助信息：text-xs text-muted-foreground
主输入或主预览区正文：text-base leading-8
```

面板视觉规格优先遵循：

```text
主操作区和设置区使用 rounded-2xl border border-border bg-background shadow-sm
历史项使用 rounded-xl
设置区在桌面端固定宽度 360px，避免被内容撑宽
历史区在桌面端固定宽度 292px，历史列表需要可滚动
移动端按自然顺序堆叠：历史记录、主操作区、参数设置区
```

除非用户明确要求单页营销式布局，类似 AI 工具页面不得使用大幅 hero、装饰性卡片堆叠或与 `/voice` 明显不一致的比例。

### 3.2.2 前端页面说明文字约束

前端页面设计中，默认避免加入和用户当前交互无关的解释说明文字，包括名词解释、功能作用说明、设计意图说明、操作教学式长文案等。页面文案应优先服务于用户决策、输入、确认、反馈和导航。

如果某个字段、选项、指标或功能确实需要补充说明，优先使用信息图标承载：在项目名称、表单标签、设置项标题或指标名称右侧放置信息图标（如 `Info`），鼠标悬停或键盘聚焦时展示 tooltip/popover 说明文字。移动端或无 hover 场景，信息图标应可点击打开同一说明。

说明内容应简短、面向当前操作，不在页面常态区域展开占位。错误提示、表单校验、空状态、合规/支付/权限/风险提示、用户必须阅读才能完成当前操作的关键说明可以直接展示，但仍应保持简洁。

---

### 3.3 后端技术栈

核心业务后端使用：

```text
NestJS
TypeScript
Prisma ORM
PostgreSQL
Redis
```

NestJS 负责：

1. 用户注册与登录
2. 管理员登录
3. 权限校验
4. CMS 内容管理
5. 支付订单
6. 钱包与流水
7. AI 任务编排
8. 系统配置

第一阶段优先实现：

```text
Auth
AdminAuth
CMS
SystemConfig
```

后置实现：

```text
Payment
Wallet
AiTask
```

---

### 3.4 AI 执行层

AI 执行层预留：

```text
FastAPI
Python 3.11+
Uvicorn
```

第一阶段可以只保留：

```text
GET /health
```

FastAPI 不负责用户鉴权、管理员权限、充值、扣点、钱包流水、CMS 内容管理，也不得直连核心 PostgreSQL。

---

### 3.5 固定端口规则

本项目所有本地开发、Docker 容器内部端口、服务间通信、文档示例和默认环境变量优先使用 `3320-3329` 之间的端口，不得换用 `3000`、`3002`、`3003`、`5432`、`5433`、`6379`、`6380`、`8001`、`8080`、`8443` 等其他项目常用端口。

生产公网入口例外：线上对外访问可以使用常用端口 `80/443`，但只能作为宿主机或负载均衡入口映射到容器内部的 `3320/3326`，不得改变容器内部端口和服务间通信端口。

本地 Docker Compose 项目名固定为：

```text
xueleai
```

生产 Docker Compose 项目名默认使用：

```text
xueleai-prod
```

本地开发 volume 必须使用 `xueleai_postgres_data`、`xueleai_redis_data`。  
生产 volume 必须使用 `xueleai-prod_postgres_data`、`xueleai-prod_redis_data`。  
不得复用其他项目的数据库、Redis、Compose project、container 或 volume 名称。

固定端口表：

```text
3320  Docker / Nginx HTTP 容器内部统一入口
3321  Next.js Web
3322  NestJS API Core
3323  FastAPI AI Gateway
3324  本地开发 PostgreSQL
3325  本地开发 Redis
3326  Docker / Nginx HTTPS 容器内部入口
3327  生产 Compose PostgreSQL
3328  生产 Compose Redis
3329  测试中需要故意不可达地址时使用
```

新增服务、脚本、测试、文档或环境变量时，必须先复用上表端口。确需新增端口时，必须先确认 `3320-3329` 中有可用端口，并同步更新本节端口表；不得临时占用端口段外的值。

---

## 4. 简体中文约束

第一阶段只做简体中文版。

必须遵守：

1. 所有前台页面使用简体中文。
2. 所有后台页面使用简体中文。
3. 所有菜单、按钮、表单校验、错误提示使用简体中文。
4. 所有 seed 数据使用简体中文。

第一阶段禁止实现：

1. 英文站
2. 多语言路由
3. 多语言文章
4. 多语言后台
5. 多语言 SEO
6. 多语言 Prompt
7. 复杂 i18n 框架封装

数据库字段不要写成 `titleZh`、`contentZh`。  
第一阶段直接使用：

```text
title
slug
summary
content
seoTitle
seoDescription
```

---

## 5. 支付约束

第一阶段支付体系只支持：

```text
ALIPAY
WECHAT_PAY
```

禁止第一阶段实现：

1. Stripe
2. Paddle
3. PayPal
4. Apple Pay
5. Google Pay
6. 订阅自动续费
7. 国际支付
8. 多币种支付

第一版只做点数充值订单和支付回调预留。实际 SDK 接入可以后置，但模型层不得引入 Stripe、Paddle 等无关字段。

---

## 6. CMS 第一阶段范围

第一阶段必须实现简单 CMS：

1. 文章分类管理
2. 文章管理
3. 单页管理

禁止第一阶段实现：

1. 多语言内容
2. 可视化页面搭建器
3. 协同编辑
4. 版本历史
5. 复杂媒体资源库
6. 工作流审批

---

## 7. 用户与管理员约束

第一阶段必须区分：

```text
User
AdminUser
```

前台用户第一阶段支持：

1. 邮箱注册
2. 邮箱登录
3. 密码登录
4. 退出登录
5. 获取当前用户信息

后台管理员第一阶段支持：

1. 管理员账号登录
2. 管理员退出登录
3. 获取当前管理员信息
4. 后台路由鉴权

第一阶段可以先使用单一超级管理员角色：

```text
SUPER_ADMIN
```

暂时不做复杂权限矩阵。

---

## 8. API 响应格式

所有 NestJS API 必须使用统一响应格式：

```ts
{
  code: number
  message: string
  data: unknown
}
```

成功响应：

```ts
{
  code: 0,
  message: "成功",
  data: {}
}
```

失败响应：

```ts
{
  code: 40001,
  message: "请求参数错误",
  data: null
}
```

不得在不同模块中自定义不同响应格式。

---

## 9. 错误提示

所有错误提示必须使用简体中文。

不得直接向用户暴露：

1. Prisma error
2. SQL error
3. JWT malformed
4. Internal server error
5. Stack trace

内部错误可以写入日志，但返回给前端必须是中文友好提示。

---

## 10. Slug 约束

文章分类、文章、单页都必须支持 `slug`。

Slug 规则：

1. 同一资源类型下 slug 必须唯一。
2. slug 只能包含小写字母、数字和短横线。
3. slug 不允许为空。
4. slug 不允许使用系统保留路由。

保留 slug 示例：

```text
admin
login
register
dashboard
api
articles
pages
settings
```

---

## 11. 安全约束

第一阶段必须实现基础安全要求：

1. 密码必须哈希存储。
2. 不得明文存储用户密码。
3. JWT Secret 必须来自环境变量。
4. 数据库连接字符串必须来自环境变量。
5. 管理后台接口必须验证管理员身份。
6. 前台用户接口必须验证用户身份。
7. CMS 写操作必须要求管理员登录。
8. 前台只展示已发布内容。

禁止：

1. 在代码中硬编码密钥。
2. 在代码中硬编码数据库连接串。
3. 将管理员密码写死在源码中。
4. 未登录即可访问后台 API。
5. 前台访问草稿文章。

---

## 12. Codex 开发纪律

Codex 每次开发任务必须小步提交，不得一次性实现过多模块。

每个任务必须明确：

1. 允许修改的目录
2. 不允许修改的目录
3. 需要实现的功能
4. 验收命令
5. 验收页面
6. 是否需要数据库 migration
7. 是否需要 seed 更新

Codex 不得自行扩大需求范围。

开发 CMS 时不得顺手实现支付、AI、多语言、复杂权限、素材库、可视化建站。  
开发 Auth 时不得顺手实现 OAuth、短信验证码、魔法链接、企业微信登录。  
开发支付时不得顺手实现 Stripe、Paddle、订阅续费、多币种、发票系统。

### 12.1 Superpowers 调用强度规则

默认采用轻量执行，按任务风险升级，不把所有任务都当作高风险工程任务处理。除非用户明确要求完整流程，或任务触发下方严格模式条件，否则不得默认叠加 brainstorming、详细计划文档、子代理开发、独立代码审查和全量 TDD。

| 模式 | 适用任务 | 固定流程 |
| --- | --- | --- |
| 轻量 | 文案、样式、页面微调、配置修改、低风险局部调整 | 直接检查必要上下文并修改；只运行最小充分验证；不写计划文档；不派审查代理 |
| 标准 | 普通功能、局部 Bug、接口调整、学习计划、闪卡逻辑等中等风险任务 | 简短说明思路；实现后运行针对性测试或类型检查；完成前做一次相关验证 |
| 严格 | 支付、权限、隐私、安全、数据迁移、破坏性操作、公开 API、企业钱包、校友敏感数据、ERP/U9 数据读取、发布前检查、跨模块架构调整 | 使用完整 TDD、必要的全量测试、独立代码审查和最终验真 |

Superpowers 使用规则：

1. 不得默认调用 `brainstorming`、`writing-plans`、`subagent-driven-development`、`requesting-code-review` 或完整 TDD。
2. 小范围、需求明确、少于三个模块的任务，不创建计划文档。
3. 文案、样式、配置、孤立低风险改动，不派发审查代理。
4. 开发过程中优先运行针对性测试；只有发布、合并、跨模块改动或严格模式任务才运行全量测试。
5. 保留 `systematic-debugging` 用于真实 Bug、测试失败、线上异常和无法解释的行为；不要把普通明确修改强行升级为排障流程。
6. 保留一次最终 `verification-before-completion`；不得在代码或相关环境没有变化时重复运行同一个验证命令。
7. 如果任务从轻量或标准升级到严格模式，必须先说明升级原因，再执行完整流程。
8. 用户在任务开头声明“轻量开发模式”时，必须按轻量模式执行；只有发现支付、权限、安全、数据迁移、公共接口或跨模块架构风险时才升级。

推荐轻量模式提示词：

```text
本任务采用轻量开发模式。直接检查必要上下文并完成修改，不执行 Superpowers 的 brainstorming、详细计划文档、子代理开发和独立代码审查。修改后只运行与本次改动直接相关的测试、类型检查或构建一次。只有发现涉及支付、权限、安全、数据迁移、公共接口或跨模块架构风险时，才升级为完整流程，并先说明升级原因。避免重复运行相同验证。
```

---

## 13. 小修改任务规则

当用户要求“修改文案、按钮、样式、弹窗、轻量交互”时，默认采用最小 diff 模式。

### 13.1 默认限制

1. 不做架构重构。
2. 不迁移页面。
3. 不新增兼容路由。
4. 不升级依赖。
5. 不修改数据库 schema。
6. 不修改支付、登录、权限等核心流程，除非用户明确要求。
7. 优先复用现有组件和 API。
8. 修改总量超过 150 行前，必须先停止并说明原因。

### 13.2 验证规则

小修改默认只运行：

```bash
pnpm --filter @xueleai/web typecheck
```

只有在以下情况才运行 build：

1. 改动涉及 Next.js server component。
2. 改动涉及路由结构。
3. 改动涉及构建配置。
4. 用户明确要求完整构建验证。

不要默认运行：

1. curl 页面测试。
2. 端口检查。
3. 全量 build。
4. 全量 lint。
5. 全项目测试。

### 13.3 完成规则

完成后只汇报：

1. 修改文件
2. 修改内容
3. 执行的验证命令
4. 未执行的验证命令及原因

---

## 14. 第一阶段禁止实现清单

第一阶段明确禁止实现：

1. 多语言系统
2. Stripe 支付
3. Paddle 支付
4. 国际化订阅
5. 企业多租户
6. 复杂角色权限矩阵
7. OAuth 登录
8. 手机短信登录
9. 魔法链接
10. 复杂 AI Agent 编排
11. RAG 知识库
12. 多模型自动路由
13. 可视化页面搭建器
14. 协同编辑
15. 复杂媒体资源库
16. 小程序
17. APP

---

## 15. 推荐验收命令

Codex 每完成一个任务后，必须尽量运行：

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

数据库相关命令：

```bash
pnpm db:migrate
pnpm db:seed
```

本地运行：

```bash
docker compose up -d
pnpm dev
```

如果某个命令暂时不存在，Codex 必须先说明原因，并补充对应 script，而不是忽略验收步骤。

---

## 16. GitHub 与线上服务器发布固定规则

发布必须分为两个阶段：

1. GitHub 发布
2. 线上服务器发布

只完成 GitHub 推送时，只能说明“GitHub 已发布”，不得说明“线上已发布成功”。只有完成服务器部署并通过线上复验后，才可以说明“线上发布成功”。

GitHub 发布必须确认：

```bash
git ls-remote origin refs/heads/main
```

远端 `main` 必须指向本次发布提交。

线上服务器发布必须确认：

1. 服务器部署目录为 `/opt/xueleai`。
2. `/opt/xueleai` 是发布目录，不是 Git 仓库。
3. 发布同步必须保留服务器上的 `.env.production`、`deploy/data/`、`deploy/certs/`。
4. 发布同步不得包含电子教材 PDF、Markdown 本地资产、本地同步备份、数据库备份、证书、密钥或真实环境变量。
5. 生产数据库不得执行 `prisma migrate reset`，不得删除 PostgreSQL / Redis volume。

线上复验必须至少包括：

```bash
curl -fsS https://xueleai.com/api/health
curl -fsS https://xueleai.com/api/system-config/public
```

如果本次发布涉及页面可见行为，还必须检查线上页面 HTML 或浏览器页面，确认真实用户访问到的页面已经变化。

发布结果汇报必须区分：

1. GitHub 是否发布成功。
2. 服务器是否部署成功。
3. 线上 API 是否健康。
4. 线上页面行为是否符合本次需求。

任一线上验证失败时，必须明确说明“GitHub 已发布，线上发布未完成/失败”，不得模糊表述为发布成功。
