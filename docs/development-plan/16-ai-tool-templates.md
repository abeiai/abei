# 阶段 16：AI 工具模板与场景市场

## 目标

让项目部署后不仅能调用模型，还能马上拥有一批可用的 AI 工具。

本阶段将 AI 场景升级为可配置、可导入导出、可分类展示的工具模板体系。

---

## 允许修改目录

```text
apps/web/
apps/api-core/
packages/database/
docs/
scripts/
```

如工具执行依赖 FastAPI，可修改：

```text
apps/ai-gateway/
```

---

## 本阶段任务

```text
111 预置基础 AI 工具
112 工具输入 Schema
113 工具模板导入 / 导出
114 工具分类
115 工具详情页标准化
```

---

## 任务 111：预置基础 AI 工具

### 目标

seed 一批开箱即用的 AI 工具。

### 建议预置工具

```text
AI 文案生成
AI 标题生成
AI 文章摘要
AI 文章润色
AI 小红书文案
AI SEO 标题描述生成
AI 问答助手
AI 翻译
AI 英文润色
AI 代码解释
```

### 每个工具必须包含

```text
名称
slug
描述
分类
输入字段 schema
Prompt 模板
默认模型别名
点数消耗规则
是否启用
排序值
```

### 要求

1. 默认工具可以通过 seed 创建。
2. 不覆盖开发者修改过的工具。
3. 工具默认使用模型别名，不绑定具体模型。
4. 工具文案为简体中文。

---

## 任务 112：工具输入 Schema

### 目标

工具表单不再写死在前端，而是由 schema 动态渲染。

### 推荐 schema 示例

```json
{
  "fields": [
    {"name": "topic", "label": "主题", "type": "text", "required": true},
    {"name": "tone", "label": "语气", "type": "select", "required": false, "options": ["专业", "轻松", "营销", "学术"]}
  ]
}
```

### 支持字段类型

```text
text
textarea
select
number
switch
```

### 要求

1. 前端根据 schema 自动渲染表单。
2. 后端根据 schema 校验输入。
3. 缺少必填字段时返回中文错误。
4. schema 必须可被后台编辑或导入。

---

## 任务 113：工具模板导入 / 导出

### 目标

让开发者可以复用和迁移 AI 工具模板。

### 功能

```text
导出单个工具模板 JSON
导出全部工具模板 JSON
导入工具模板 JSON
导入时预览变更
导入时避免 slug 冲突
```

### 要求

1. 导入前校验 JSON 格式。
2. 导入前校验 inputSchema。
3. 导入后写入管理员操作日志。
4. 不导出任何 API Key。
5. 不导出用户历史任务。

---

## 任务 114：工具分类

### 目标

让 AI 工具可以按分类管理和展示。

### 推荐分类

```text
写作
营销
SEO
教育
办公
编程
翻译
图像
```

### 推荐模型

```text
AiToolCategory
- id
- name
- slug
- description
- sortOrder
- isVisible
- createdAt
- updatedAt
```

### 要求

1. 后台可以管理工具分类。
2. 前台 `/tools` 可以按分类筛选。
3. 不可见分类不在前台展示。
4. slug 规则遵循全局 slug 契约。

---

## 任务 115：工具详情页标准化

### 路由

```text
/tools/[slug]
```

### 标准模块

```text
工具介绍
输入表单
点数消耗说明
生成按钮
生成结果
历史记录
相关推荐工具
登录 / 充值提示
```

### 要求

1. 未登录用户可以查看工具介绍。
2. 未登录用户提交时提示登录。
3. 点数不足时提示充值。
4. 模型未配置时提示管理员配置模型。
5. 工具未启用时前台不可访问。

---

## 本阶段禁止事项

```text
1. 不做 RAG。
2. 不做 Agent。
3. 不做复杂工作流。
4. 不做多语言工具市场。
5. 不导入任何真实 API Key。
6. 不让前端绕过后端直接调用模型。
```

---

## 验收标准

```text
1. seed 创建基础 AI 工具。
2. 工具表单可以通过 schema 自动渲染。
3. 后端可以校验工具输入。
4. 工具模板可以导入和导出。
5. 工具分类可以管理。
6. 前台工具列表可以按分类展示。
7. 工具详情页可以提交任务。
8. 未登录、点数不足、模型未配置时都有中文提示。
```

---

## 验收命令

```bash
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
