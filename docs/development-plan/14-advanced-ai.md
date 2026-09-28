# 阶段 14：高级 AI 能力

## 目标

在真实 AI Provider、支付、钱包和运营后台稳定后，逐步增强高级 AI 能力。

本阶段按能力逐步推进，不得一次性实现 RAG、Agent、工作流等复杂能力。

## 允许修改目录

```text
apps/web/
apps/api-core/
apps/ai-gateway/
packages/database/
docs/
```

## 本阶段任务

```text
091 SSE 流式输出
092 AI 场景 Prompt 模板变量
093 用户历史任务
094 文件上传解析
095 知识库基础模型
096 RAG 检索
097 多模型配置
098 模型 fallback
099 Agent 工具调用
100 工作流编排
```

## 任务 091：SSE 流式输出

### 要求

```text
1. FastAPI 支持流式输出。
2. NestJS 可以代理或转发流式响应。
3. 前端支持逐字显示。
4. 失败时释放冻结点数。
5. 中断时任务状态正确。
```

## 任务 092：AI 场景 Prompt 模板变量

### 示例

```text
请为 {{topic}} 写一篇面向 {{audience}} 的文章，语气为 {{tone}}。
```

### 要求

```text
1. 后台可配置模板。
2. 前端根据模板生成表单。
3. 后端校验必填变量。
4. 渲染后的 Prompt 可用于 AI 调用。
```

## 任务 093：用户历史任务

### 路由

```text
/dashboard/tasks
/dashboard/tasks/[id]
```

### 要求

```text
1. 用户只能查看自己的任务。
2. 管理员可以查看所有任务。
3. 任务详情显示输入、输出、状态和消耗点数。
```

## 任务 094：文件上传解析

### 第一版支持

```text
txt
md
pdf
docx
```

### 要求

```text
1. 限制文件大小。
2. 限制文件类型。
3. 提取文本内容。
4. 不支持的文件返回中文提示。
```

## 任务 095：知识库基础模型

### 推荐模型

```text
KnowledgeBase
- id
- userId
- name
- description
- createdAt
- updatedAt

KnowledgeDocument
- id
- knowledgeBaseId
- filename
- status
- contentText
- createdAt
- updatedAt

KnowledgeChunk
- id
- documentId
- content
- embeddingId
- sortOrder
- createdAt
```

## 任务 096：RAG 检索

### 第一版要求

```text
1. 文档切块。
2. 向量化。
3. 检索相关片段。
4. 将片段拼入 Prompt。
5. 生成回答。
```

### 禁止

```text
不要一开始做复杂多租户知识库权限。
不要一开始做复杂评测系统。
```

## 任务 097：多模型配置

### 要求

```text
1. 后台可以新增多个模型。
2. AI 场景可以绑定默认模型。
3. 用户提交任务时使用场景默认模型。
4. 管理员可以启用或禁用模型。
```

## 任务 098：模型 fallback

### 要求

```text
1. 只有明确配置 fallbackModel 时才启用。
2. fallback 过程必须记录日志。
3. 不得重复扣点。
4. 最终按实际成功模型 usage 结算。
```

## 任务 099：Agent 工具调用

### 第一版只允许内部安全工具

```text
当前时间
简单计算
站内文章查询
用户历史任务查询
```

### 禁止

```text
1. 不允许任意执行 shell。
2. 不允许访问服务器文件系统。
3. 不允许执行危险网络请求。
4. 不允许读取其他用户数据。
```

## 任务 100：工作流编排

### 第一版工作流

```text
输入 → 第一步生成 → 第二步改写 → 第三步总结 → 输出
```

### 要求

```text
1. 工作流由管理员配置。
2. 每一步有明确 Prompt。
3. 每一步记录结果。
4. 失败时停止后续步骤。
5. 点数扣除规则明确。
```

## 本阶段禁止事项

```text
1. 不要一次性实现完整 Agent 平台。
2. 不要开放任意工具调用。
3. 不要允许 AI 直接操作数据库。
4. 不要绕过 NestJS 钱包和权限系统。
5. 不要让 FastAPI 直连核心 PostgreSQL。
```

## 验收标准

```text
1. 流式输出可用。
2. Prompt 模板变量可配置。
3. 用户可以查看历史任务。
4. 文件上传解析可用。
5. 知识库模型可创建。
6. RAG 基础检索可用。
7. 多模型配置可用。
8. fallback 不重复扣点。
9. Agent 工具调用受限且可审计。
10. 简单工作流可运行。
```

## 验收命令

```bash
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

FastAPI 目录如有独立命令，也需运行：

```bash
ruff check .
mypy .
pytest
```
