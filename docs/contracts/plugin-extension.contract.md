# 插件化与扩展接口约定

本约定覆盖阶段 19 的 Provider、AI 工具模板和主题配置扩展能力。当前阶段只提供本地扩展接口，不做插件市场、远程安装、任意代码执行或 shell 执行。

## ProviderAdapter

核心业务通过 `ProviderAdapter` 调用不同 AI Provider，新增 Provider 时应只新增 Adapter，不改 AI 任务业务流程。

接口方法：

- `testConnection()`：测试 Provider Base URL、API Key 和模型名称。
- `generateText()`：非流式文本生成。
- `streamText()`：流式文本生成。
- `generateEmbedding()`：向量生成接口预留。
- `generateImage()`：图片生成接口预留。
- `calculateUsage()`：按 Provider 返回的 usage 计算点数消耗。

错误要求：

- Provider 原始错误不得直接暴露给前端用户。
- Adapter 必须转换为统一中文错误消息。
- 暂未实现的能力必须返回中文提示，例如“当前 Provider 暂未支持向量生成”。

## AI 工具模板

工具模板支持代码注册和 JSON 导入。模板字段：

```json
{
  "toolKey": "copywriting",
  "name": "营销文案生成",
  "slug": "copywriting",
  "category": {
    "name": "写作",
    "slug": "writing"
  },
  "description": "生成简体中文营销文案",
  "inputSchema": {
    "fields": []
  },
  "promptTemplate": "请处理：{input}",
  "modelAlias": "default-chat",
  "costRule": {
    "type": "fixed",
    "credits": 100
  },
  "isEnabled": true
}
```

约束：

- `slug` 或 `toolKey` 必须唯一，冲突时返回中文提示。
- 默认不覆盖已有工具配置，除非调用方明确传入覆盖策略。
- 模板中不得包含 `apiKey`、`api_key`、`secret`、`token` 等密钥字段。
- 当前只支持 `fixed` 点数规则。

## 主题与 UI 配置

主题配置存储在数据库 `SystemConfig` 中，前台只读取公开配置。

公开配置：

- `siteName`：站点名称。
- `siteLogo`：Logo 图片地址。
- `themePrimaryColor`：主题主色，只允许 6 位十六进制颜色。
- `homeTitle`：首页 Hero 标题。
- `homeDescription`：首页 Hero 副标题。
- `publicNavItems`：前台导航，每行 `名称|站内路径`。
- `footerText`：Footer 文案。
- `beianNo`：备案号。
- `serviceQrCode`：客服二维码图片地址。

安全要求：

- 导航路径只允许站内路径，不允许 `javascript:`、`//`、`<`、`>`。
- 前台不渲染配置中的 HTML。
- 图片地址只允许站内路径或 `http/https` URL。
