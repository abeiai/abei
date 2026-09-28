# 场景应用开发文档

更新时间：2026-06-01

本文档用于向第三方开发者说明如何基于 AI SaaS 平台开发“场景应用”。本文档需要随平台版本迭代同步更新，尤其是认证、AI 模型、计费扣点、任务记录、组织账号和支付接口发生变化时。

## 1. 场景应用定义

场景应用是基于本平台开发规则构建的、解决某个具体场景需求的应用。

示例：

1. 招生简章生成器。
2. 电商商品图生成器。
3. 短视频脚本生成器。
4. 法务合同摘要工具。
5. 会议纪要整理工具。
6. 行业语音播报工具。

场景应用通常需要统一调用平台已有能力：

1. 用户登录与身份体系。
2. 个人钱包或组织钱包。
3. AI 模型配置和模型别名。
4. 文本、图片、视频、语音等 AI 能力。
5. 任务记录。
6. 计费、预估、扣点和流水。
7. 素材资源。
8. 用量成本看板。

场景应用不应成为平台核心流程的一部分。应用的新增、启用、禁用、删除或版本升级，都不应影响平台基础功能和其他场景应用。

## 2. 平台技术框架

本平台采用 pnpm Monorepo。

```text
apps/
  web/          Next.js 前台、用户中心、体验区、管理后台
  api-core/     NestJS 核心业务 API
  ai-gateway/   FastAPI AI 执行层，负责模型调用执行

packages/
  database/     Prisma schema、migration、seed
  config/       共享 ESLint、TSConfig 等配置
```

主要技术栈：

| 层级 | 技术 |
| --- | --- |
| 前台与后台 | Next.js App Router、TypeScript、TailwindCSS、shadcn/ui、Zustand |
| 核心 API | NestJS、TypeScript、Prisma ORM |
| 数据库 | PostgreSQL |
| 缓存与异步辅助 | Redis |
| AI 执行层 | FastAPI、Python、Uvicorn |
| 包管理 | pnpm workspace |
| 部署 | Docker Compose、Nginx |

本地固定端口：

| 端口 | 服务 |
| --- | --- |
| 3320 | Docker / Nginx HTTP 入口 |
| 3321 | Next.js Web |
| 3322 | NestJS API Core |
| 3323 | FastAPI AI Gateway |
| 3324 | 本地 PostgreSQL |
| 3325 | 本地 Redis |
| 3326 | Docker / Nginx HTTPS 入口 |
| 3327 | 生产 Compose PostgreSQL |
| 3328 | 生产 Compose Redis |

新增场景应用不得引入端口段外的新服务端口。确需新增服务时，必须先确认 `3320-3329` 中有可用端口，并同步更新 `AGENTS.md`。

## 3. 已实现的平台能力

截至本文档更新时间，平台已经具备以下能力。

### 3.1 用户与管理员

1. 前台用户注册、登录、退出。
2. 邮箱登录。
3. 手机验证码登录。
4. 用户资料维护。
5. 用户中心。
6. 后台管理员登录、退出。
7. 后台操作日志。

前台用户与后台管理员是两套身份：

```text
User       前台用户
AdminUser  后台管理员
```

场景应用面向普通用户时，应复用前台用户登录态，不得自行实现独立账号体系。

### 3.2 组织账号

平台已开始支持组织账号体系：

1. 创建组织。
2. 组织成员。
3. 成员启用、禁用。
4. 成员点数分配与调整。
5. 个人身份与组织身份切换。

场景应用产生扣点时，应识别当前计费身份：

```text
personal      个人账号
organization 组织账号
```

用户切换到组织身份后，场景应用的 AI 消耗应从组织对应额度或组织钱包中扣除，而不是从个人钱包扣除。

### 3.3 钱包、产品和支付

平台已实现：

1. 用户点数钱包。
2. 点数流水。
3. 后台人工充值。
4. 前台充值产品。
5. 支付宝和微信支付配置。
6. 支付订单。
7. 支付回调预留与补单能力。

场景应用不得直接修改钱包余额，也不得直接写入支付订单。所有充值、扣点、释放、退款、后台调整都必须走平台钱包和支付服务。

### 3.4 AI 模型与 Provider

平台已实现：

1. AI Provider 配置。
2. 模型配置。
3. 默认模型绑定。
4. 模型别名。
5. 文本模型。
6. 图片生成模型。
7. 视频生成模型。
8. 语音模型。
9. 模型定价配置。
10. AI 用量成本统计。

场景应用应优先通过模型别名或能力查询选择模型，不应在业务代码中硬编码 API Key 或 Provider 细节。

### 3.5 AI 能力

平台已实现或正在迭代的 AI 能力：

| 能力 | 前台入口 | 核心用途 |
| --- | --- | --- |
| AI 对话 | `/experience/chat` | 文本对话、流式输出、Markdown 渲染、tokens 计费 |
| 图片生成 | `/experience/image` | 文生图、参考图生成、图片任务 |
| 视频生成 | `/experience/video` | 文生视频、参考文件生成、视频任务 |
| 语音合成 | `/voice` | 文本转语音、音色选择、语音任务 |

场景应用可以基于这些能力组合出更具体的业务流程。例如，招生营销应用可以同时调用文本生成、图片生成和语音合成。

### 3.6 CMS、素材和页面能力

平台已实现：

1. 文章分类、文章、单页、内容标签。
2. 素材资源，支持图片、音频、视频。
3. 模块管理。
4. 页面编排。
5. 菜单管理。
6. 前台公开内容读取。

场景应用如果需要展示内容页，应优先复用 CMS、素材资源和模块能力，避免重复建设内容管理系统。

## 4. API 基础规则

### 4.1 API 地址

本地 API Core：

```text
http://localhost:3322/api
```

Web 侧 Next.js API 代理：

```text
http://localhost:3321/api
```

场景应用前端优先调用 Web 侧封装或 Server Action。需要直接访问 API Core 时，应使用环境变量配置，不要硬编码域名。

### 4.2 统一响应格式

所有 NestJS API 使用统一响应格式。

成功：

```json
{
  "code": 0,
  "message": "成功",
  "data": {}
}
```

失败：

```json
{
  "code": 40001,
  "message": "请求参数错误",
  "data": null
}
```

场景应用不得自行返回另一套响应格式。

### 4.3 错误提示

所有用户可见错误必须使用简体中文。

不得向前端用户暴露：

1. Prisma error。
2. SQL error。
3. JWT malformed。
4. Stack trace。
5. Provider 原始错误。
6. API Key 或密钥片段。

### 4.4 认证规则

场景应用必须复用平台登录态。

常用接口：

| 接口 | 说明 |
| --- | --- |
| `POST /api/auth/register` | 邮箱注册 |
| `POST /api/auth/login` | 邮箱登录 |
| `POST /api/auth/phone-code` | 发送手机验证码 |
| `POST /api/auth/phone-login` | 手机验证码登录 |
| `POST /api/auth/logout` | 退出登录 |
| `POST /api/auth/refresh` | 刷新登录态 |
| `GET /api/auth/me` | 当前用户 |

场景应用不应自行解析 JWT。前端应通过现有用户会话能力判断当前用户和当前计费身份。

### 4.5 幂等规则

任何会产生扣点、订单、任务、文件写入的接口都必须支持幂等。

建议字段：

```json
{
  "idempotencyKey": "scene-app-key:user-id:operation-id"
}
```

同一个 `idempotencyKey` 的重复请求不得重复扣点、重复生成订单或重复写入关键业务记录。

## 5. 现有 API 能力概览

以下为平台已存在的核心 API 分类。具体 DTO 以代码实现为准，第三方开发者应优先调用平台提供的封装方法。

### 5.1 AI 公共接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/ai/chat/models` | 获取可用于对话的模型 |
| `GET` | `/api/ai/image/models` | 获取可用于图片生成的模型 |
| `GET` | `/api/ai/video/models` | 获取可用于视频生成的模型 |
| `POST` | `/api/ai/chat/stream` | 流式对话 |
| `POST` | `/api/ai/image/generate` | 创建图片生成任务 |
| `POST` | `/api/ai/video/generate` | 创建视频生成任务 |
| `GET` | `/api/ai/video/tasks/:taskId` | 查询视频任务 |
| `POST` | `/api/ai/tasks` | 创建通用 AI 任务 |
| `POST` | `/api/ai/tasks/stream` | 创建流式 AI 任务 |
| `GET` | `/api/ai/tasks` | 查询用户 AI 任务 |
| `GET` | `/api/ai/tasks/:id` | 查询 AI 任务详情 |

### 5.2 语音接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/audio/models` | 获取语音模型 |
| `GET` | `/api/audio/voices` | 获取可用音色 |
| `PATCH` | `/api/audio/voices/default` | 设置默认音色 |
| `GET` | `/api/audio/assets` | 获取用户语音素材 |
| `POST` | `/api/audio/assets` | 创建语音素材记录 |
| `POST` | `/api/audio/assets/upload` | 上传语音素材 |
| `GET` | `/api/audio/tasks` | 查询语音任务 |
| `GET` | `/api/audio/tasks/:id` | 查询语音任务详情 |
| `POST` | `/api/audio/tasks/tts` | 文本转语音 |
| `POST` | `/api/audio/tasks/voice-clone` | 声音复刻任务 |
| `POST` | `/api/audio/tasks/voice-design` | 声音设计任务 |

### 5.3 钱包和支付接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/wallet/me` | 当前用户钱包 |
| `GET` | `/api/wallet/ledger` | 当前用户钱包流水 |
| `GET` | `/api/payment/products` | 支付产品 |
| `GET` | `/api/payment/recharge-products` | 前台充值产品 |
| `POST` | `/api/payment/orders` | 创建支付订单 |
| `GET` | `/api/payment/orders/:id` | 查询支付订单 |

场景应用如果只是消耗点数，不应自己创建充值订单。购买流程应跳转或调用平台统一支付产品和订单接口。

### 5.4 组织接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/organizations` | 当前用户可访问组织 |
| `POST` | `/api/organizations` | 创建组织 |
| `GET` | `/api/organizations/:id` | 组织详情 |
| `GET` | `/api/organizations/users/search` | 搜索可加入组织的用户 |
| `POST` | `/api/organizations/:id/members` | 添加组织成员 |
| `PATCH` | `/api/organizations/:id/members/:memberId` | 修改组织成员 |
| `POST` | `/api/organizations/:id/members/:memberId/quotas` | 分配成员额度 |
| `POST` | `/api/organizations/:id/members/:memberId/quotas/adjust` | 调整成员额度 |

### 5.5 CMS 与公开内容接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/public/articles` | 公开文章列表 |
| `GET` | `/api/public/articles/:slug` | 公开文章详情 |
| `GET` | `/api/public/pages` | 公开单页列表 |
| `GET` | `/api/public/pages/:slug` | 公开单页详情 |
| `GET` | `/api/public/modules` | 公开模块列表 |
| `GET` | `/api/public/modules/:slug` | 公开模块详情 |
| `GET` | `/api/public/page-compositions/home` | 首页编排 |
| `GET` | `/api/public/page-compositions/pages/:slug` | 单页编排 |

## 6. 场景应用解耦原则

### 6.1 必须独立命名

每个场景应用必须拥有稳定的唯一标识：

```text
appKey: admission-copywriter
slug: admission-copywriter
displayName: 招生文案生成器
```

建议命名规则：

1. `appKey` 使用小写字母、数字和短横线。
2. `appKey` 一经发布不得变更。
3. 数据库记录、任务记录、用量记录、日志记录都应保存 `appKey`。

### 6.2 禁止直接耦合平台核心表

场景应用不得直接写入或修改以下核心表的余额和状态字段：

1. 用户钱包。
2. 组织钱包。
3. 钱包流水。
4. 支付订单。
5. AI Provider。
6. 模型配置。
7. 管理员账号。
8. 用户账号。

如果需要新增业务数据，可以新增场景应用自己的表，但必须通过平台服务完成认证、AI 调用、扣点和任务记录。

### 6.3 启用、禁用和删除

场景应用状态建议分为：

```text
DRAFT      草稿
ENABLED    已启用
DISABLED   已禁用
ARCHIVED   已归档
DELETED    已删除标记
```

状态规则：

1. `DRAFT`：仅管理员可见，不对用户开放。
2. `ENABLED`：用户可访问并可创建新任务。
3. `DISABLED`：用户不可创建新任务，但历史任务、订单、流水仍可查看。
4. `ARCHIVED`：不在前台入口展示，但历史数据保留。
5. `DELETED`：只做软删除标记，不物理删除历史任务、订单、流水和用量记录。

禁用或删除应用时，不能影响：

1. 用户钱包余额。
2. 已完成订单。
3. 已扣点流水。
4. 历史任务详情。
5. 其他场景应用。
6. 平台体验区。

### 6.4 版本升级

场景应用版本升级必须保留历史数据可读性。

建议版本字段：

```text
appVersion: 1.2.0
schemaVersion: 2026-06-01
promptVersion: admission-copywriter-v3
pricingVersion: model-price-2026-06
```

任务记录中应保存当次使用的版本信息。应用升级后，历史任务仍按当时版本展示，不应被新版本覆盖解释。

## 7. 推荐目录结构

如果场景应用需要平台内置开发，推荐目录如下。

前端：

```text
apps/web/src/app/apps/{appKey}/page.tsx
apps/web/src/components/scene-apps/{appKey}/
apps/web/src/lib/scene-apps/{appKey}.ts
```

后端：

```text
apps/api-core/src/scene-apps/{appKey}/
  {appKey}.module.ts
  {appKey}.controller.ts
  {appKey}.service.ts
  dto/
```

数据库：

```text
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/
```

只有在场景应用确实需要独立业务数据时，才新增数据库表。单纯的 AI 调用、任务记录、扣点和历史查询，应优先复用平台通用能力。

## 8. 场景应用 API 规划建议

为了避免新增 API 影响已有应用，场景应用 API 应该使用独立命名空间。

推荐：

```text
/api/apps/{appKey}
/api/apps/{appKey}/tasks
/api/apps/{appKey}/tasks/:id
/api/apps/{appKey}/settings
```

不推荐：

```text
/api/tasks/{appKey}
/api/ai/{appKey}
/api/custom
```

原因是这些路径容易和平台通用 API 或其他应用冲突。

### 8.1 创建任务接口建议

```http
POST /api/apps/admission-copywriter/tasks
```

请求示例：

```json
{
  "input": {
    "schoolName": "某某职业学院",
    "major": "人工智能技术应用",
    "audience": "高中毕业生"
  },
  "modelAlias": "default-chat",
  "billingContext": {
    "type": "personal",
    "organizationId": null
  },
  "idempotencyKey": "admission-copywriter:user-123:20260601120000"
}
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "taskId": "task_123",
    "status": "PROCESSING",
    "estimatedCredits": 20
  }
}
```

### 8.2 查询任务接口建议

```http
GET /api/apps/admission-copywriter/tasks/task_123
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "taskId": "task_123",
    "appKey": "admission-copywriter",
    "status": "SUCCEEDED",
    "output": {
      "markdown": "生成结果"
    },
    "usage": {
      "inputTokens": 1200,
      "outputTokens": 800,
      "credits": 16
    },
    "model": {
      "alias": "default-chat",
      "modelName": "qwen-plus"
    }
  }
}
```

## 9. AI 调用规则

### 9.1 优先使用模型别名

场景应用应优先使用模型别名：

```text
default-chat
fast-chat
reasoning
image-generation
video-generation
tts-default
```

模型别名由后台统一绑定到具体 Provider 和模型实例。这样管理员可以替换模型，而无需修改场景应用代码。

只有在场景应用确实依赖某个模型特性时，才允许显式选择模型实例，并且必须在前端展示该模型不可用时的降级提示。

### 9.2 能力标签

场景应用选择模型时，应检查模型能力标签。

常见能力：

```text
TEXT
VISION
REASONING
TOOLS
STREAMING
LONG_CONTEXT
IMAGE_GENERATION
IMAGE_INPUT
REFERENCE_IMAGE
VIDEO_GENERATION
AUDIO_TTS
```

示例：

1. 需要流式文本输出时，模型必须支持 `TEXT` 和 `STREAMING`。
2. 需要图片参考图时，模型必须支持 `IMAGE_INPUT` 或 `REFERENCE_IMAGE`。
3. 需要图片生成时，模型必须支持 `IMAGE_GENERATION`。
4. 需要语音合成时，模型必须支持 `AUDIO_TTS`。

### 9.3 不得直接调用 Provider

场景应用不得直接调用 OpenAI、DashScope、DeepSeek、阿里云语音等 Provider。

原因：

1. API Key 必须由平台统一加密管理。
2. Provider 错误需要统一转换为中文提示。
3. usage 需要进入统一计费。
4. 任务需要进入统一任务清单。
5. 用量需要进入用量成本看板。

正确路径：

```text
场景应用
  -> API Core
  -> 模型配置 / 模型别名
  -> AI Gateway 或 Provider Adapter
  -> usage 回传
  -> 计费扣点
  -> 任务记录
```

## 10. 计费与扣点规则

### 10.1 核心原则

场景应用必须使用平台统一计费体系。

原则：

1. 不直接扣数据库余额。
2. 不自己计算最终扣点作为唯一依据。
3. 不绕过模型价格配置。
4. 不绕过钱包流水。
5. 不吞掉 Provider 返回的 usage。

### 10.2 推荐流程

短任务：

```text
创建任务
  -> 估算点数
  -> 执行模型
  -> 根据 usage 和模型价格结算
  -> 写入任务记录
  -> 写入钱包流水
  -> 返回结果
```

长任务：

```text
创建任务
  -> 预占点数
  -> 执行模型
  -> 成功后按 usage 结算
  -> 多退少补或释放剩余预占
  -> 写入任务记录和钱包流水
```

失败任务：

```text
任务失败
  -> 不确认消耗
  -> 释放预占点数
  -> 保存失败任务记录
  -> 返回中文失败原因
```

### 10.3 使用记录不受应用状态影响

应用禁用、删除或升级后，以下记录仍必须保留并可查询：

1. 用户任务。
2. AI usage。
3. 钱包流水。
4. 支付订单。
5. 组织消耗记录。
6. 管理员操作日志。

应用状态只影响“是否允许创建新任务”，不影响历史记录。

## 11. 前端开发规范

### 11.1 页面语言

所有场景应用页面必须使用简体中文。

包括：

1. 页面标题。
2. 按钮。
3. 表单占位。
4. 校验提示。
5. 错误提示。
6. 空状态。
7. 任务状态。

### 11.2 UI 复用

优先复用：

1. `shadcn/ui` 基础组件。
2. 现有按钮、输入框、弹窗、Select、Textarea。
3. 平台用户菜单。
4. 平台模型选择组件。
5. 平台任务历史样式。

场景应用不应引入新的全局视觉体系，不应修改平台全局布局来服务单个应用。

### 11.3 用户身份和组织身份

场景应用页面应展示或继承当前身份：

```text
个人账号
组织账号：某某组织
```

用户切换身份后，新任务应按照新身份扣点。历史任务按照创建时身份展示，不随当前身份变化。

## 12. 后台管理建议

场景应用需要后台配置时，应提供独立后台入口。

推荐位置：

```text
后台管理 -> 工具应用 -> 场景应用
```

建议配置项：

1. 应用名称。
2. 应用标识 `appKey`。
3. 应用状态。
4. 入口路径。
5. 默认模型别名。
6. 是否允许组织身份使用。
7. 是否展示在前台导航。
8. 排序。
9. 版本号。
10. 应用说明。

后台禁用应用时，只应阻止新任务创建，不应删除历史任务和费用记录。

## 13. 数据库设计建议

如果需要平台统一管理场景应用，建议新增如下逻辑对象。

### 13.1 SceneApplication

```text
id
appKey
slug
name
description
entryPath
status
defaultModelAlias
supportsOrganization
currentVersion
sortOrder
createdAt
updatedAt
deletedAt
```

### 13.2 SceneApplicationVersion

```text
id
appId
version
promptVersion
schemaVersion
changelog
status
createdAt
```

### 13.3 SceneApplicationTask

如果平台通用 AI Task 已能满足需求，不需要新增此表。只有场景应用有复杂业务字段时，才新增应用任务表。

建议字段：

```text
id
appKey
appVersion
userId
organizationId
billingContextType
aiTaskId
status
inputSnapshot
outputSnapshot
usageSnapshot
createdAt
updatedAt
```

注意：`inputSnapshot`、`outputSnapshot`、`usageSnapshot` 用于保证历史任务在应用升级后仍能按当时状态展示。

## 14. 兼容性和 API 演进规则

新增 API 时必须遵守：

1. 新 API 使用独立命名空间。
2. 新字段只能追加，不能改变旧字段含义。
3. 新枚举值上线前，前端必须能安全处理未知值。
4. 不删除旧响应字段，除非经过废弃周期。
5. 不把单个场景应用的字段塞进通用 DTO。
6. 不让某个应用的模型选择逻辑影响其他应用。

废弃流程：

```text
新增替代字段
  -> 文档标记 deprecated
  -> 保留至少一个小版本
  -> 后台监控确认无调用
  -> 删除旧字段
```

## 15. 安全要求

场景应用必须遵守：

1. 不在前端暴露 API Key。
2. 不在代码中硬编码密钥。
3. 不允许未登录用户创建付费任务。
4. 不允许用户伪造 `organizationId` 消耗其他组织点数。
5. 不允许用户访问他人的任务详情。
6. 不允许应用绕过平台扣点。
7. 上传文件必须走平台素材或任务上传能力。
8. 管理接口必须校验管理员身份。
9. 组织管理接口必须校验组织成员身份和角色。

## 16. 开发流程建议

开发一个新场景应用时，推荐步骤：

1. 确认应用目标和 `appKey`。
2. 确认可复用的 AI 能力和模型别名。
3. 确认是否需要独立业务表。
4. 设计输入表单和输出结构。
5. 设计任务记录和历史展示。
6. 接入平台 AI 调用。
7. 接入统一计费扣点。
8. 接入个人和组织计费身份。
9. 接入错误提示和失败恢复。
10. 接入后台启用、禁用。
11. 补充文档和验收用例。

## 17. 最小场景应用验收清单

一个场景应用上线前至少满足：

1. 有唯一 `appKey`。
2. 页面使用简体中文。
3. 未登录用户不能创建付费任务。
4. 可使用个人身份扣点。
5. 如支持组织身份，可正确从组织上下文扣点。
6. 调用模型走平台模型配置或模型别名。
7. 任务成功后有任务记录。
8. 任务失败后不错误扣点。
9. usage 和消耗点数可在后台用量或任务清单中追踪。
10. 应用禁用后不能创建新任务。
11. 应用禁用后历史任务仍可查看。
12. 删除应用只做软删除或归档，不删除账务数据。
13. 错误提示为中文。
14. 没有硬编码 API Key、数据库连接串或支付密钥。

## 18. 文档维护规则

本文档必须在以下情况同步更新：

1. 新增或废弃场景应用 API。
2. AI 模型调用规则变化。
3. 模型别名规则变化。
4. 计费扣点规则变化。
5. 个人钱包或组织钱包规则变化。
6. 任务记录字段变化。
7. 支付产品或订单流程变化。
8. 组织身份切换规则变化。
9. 新增可复用平台组件。
10. 新增应用启用、禁用、删除机制。

更新时应写清楚：

1. 修改日期。
2. 影响范围。
3. 是否向后兼容。
4. 第三方应用需要做什么调整。

## 19. 推荐开发边界

场景应用可以做：

1. 新增独立页面。
2. 新增独立业务表。
3. 新增独立后台配置。
4. 复用平台 AI、钱包、任务、素材能力。
5. 为具体场景封装 Prompt 和输出格式。

场景应用不应做：

1. 自建登录系统。
2. 自建钱包。
3. 自建支付订单。
4. 直连 AI Provider。
5. 直接修改模型 API Key。
6. 修改平台全局菜单逻辑以满足单个应用。
7. 修改其他应用的数据结构。
8. 删除或改写历史账务记录。

## 20. 总结

场景应用的核心设计目标是：

```text
业务体验可以定制
底层能力统一复用
计费扣点统一结算
历史记录长期稳定
应用生命周期和平台核心解耦
```

第三方开发者应把场景应用理解为平台能力之上的业务封装层。应用负责场景输入、交互体验、Prompt 编排和结果展示；平台负责账号、权限、模型、计费、扣点、任务、钱包、订单、素材和审计。
