# 阶段 19：插件化与扩展能力

## 目标

将 AI Provider、AI 工具模板和主题配置抽象成可扩展接口，让开发者可以更容易地添加新模型、新工具和新站点风格。

本阶段不是做完整插件市场，而是先建立稳定的扩展接口。

---

## 允许修改目录

```text
apps/web/
apps/api-core/
apps/ai-gateway/
packages/database/
packages/config/
docs/
```

---

## 本阶段任务

```text
124 Provider 插件接口
125 工具模板插件接口
126 主题与 UI 配置
```

---

## 任务 124：Provider 插件接口

### 目标

定义统一 ProviderAdapter 接口，让不同 AI Provider 都能接入同一套调用流程。

### 推荐接口

```text
ProviderAdapter
- testConnection()
- generateText()
- streamText()
- generateEmbedding()
- generateImage()
- calculateUsage()
```

### 要求

1. OpenAI-compatible Adapter 实现该接口。
2. Anthropic Adapter 实现该接口或预留实现。
3. Gemini Adapter 实现该接口或预留实现。
4. 新 Provider 不应修改业务调用流程。
5. Provider 错误必须转换为统一中文错误码或错误消息。

---

## 任务 125：工具模板插件接口

### 目标

允许开发者通过 JSON 或代码注册新 AI 工具。

### 工具模板字段

```text
toolKey
name
slug
category
description
inputSchema
promptTemplate
modelAlias
costRule
isEnabled
```

### 要求

1. 支持从 JSON 注册工具。
2. 支持从代码注册工具。
3. 工具 slug 冲突时给出中文提示。
4. 注册工具不得覆盖开发者已有配置，除非明确指定。
5. 工具模板不包含任何 API Key。

---

## 任务 126：主题与 UI 配置

### 目标

让开发者不改代码也能调整基础站点风格。

### 配置项

```text
站点名称
Logo
主色
首页 Hero 标题
首页 Hero 副标题
导航菜单
Footer 文案
备案号
客服二维码
```

### 要求

1. 配置保存在数据库。
2. 前台读取配置渲染。
3. 未配置时使用默认值。
4. 不做复杂可视化建站器。
5. 不允许通过配置注入危险脚本。

---

## 本阶段禁止事项

```text
1. 不做完整插件市场。
2. 不做远程插件安装。
3. 不做任意代码执行。
4. 不开放 shell 执行能力。
5. 不做复杂可视化建站。
```

---

## 验收标准

```text
1. ProviderAdapter 接口清晰。
2. OpenAI-compatible Provider 走统一接口。
3. 新 AI 工具可以通过模板注册。
4. 工具模板导入不包含密钥。
5. 站点主题配置可保存并生效。
6. 不存在任意代码执行风险。
```

---

## 验收命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

涉及数据库变更时追加：

```bash
pnpm db:migrate
pnpm db:seed
```
