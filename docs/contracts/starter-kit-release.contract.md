# Starter Kit 发布检查契约

## release:check

必须提供命令：

```bash
pnpm release:check
```

## 检查内容

```text
lint
typecheck
test
build
migration status
env example 完整性
是否有硬编码密钥
是否有 console.log 泄露
是否有 TODO 阻塞项
是否有真实 API Key
是否有真实支付密钥
```

## 安全要求

1. 检查失败返回非 0 退出码。
2. 输出中文检查结果。
3. 不打印真实密钥。
4. 不提交真实 .env。
5. 不把 Demo 数据和生产数据混淆。

## Demo 与空白模板

必须支持：

```bash
pnpm seed:demo
pnpm template:blank
```

`seed:demo` 用于创建演示数据。  
`template:blank` 用于清理示例内容，只保留基础系统。

## 当前实现约定

`seed:demo`：

1. 写入简体中文示例文章、单页和 AI 工具模板。
2. 补齐 Provider Preset、Model Preset 和必要模型别名。
3. 重复执行时不覆盖已有同 slug 内容。
4. 不写入真实 API Key 或真实支付商户信息。

`template:blank`：

1. 只清理 Starter Kit 已知示例 slug 和 `DEMO-` 前缀订单。
2. 保留管理员账号、系统基础配置、Provider Preset、Model Preset、模型别名和数据库结构。
3. 生产环境必须先备份，并设置 `CONFIRM_TEMPLATE_BLANK=YES` 才允许执行。

`release:check`：

1. 调用根级 `lint`、`typecheck`、`test`、`build`。
2. 检查 Prisma migration status。
3. 检查 `.env.example` 与 `.env.production.example` 的关键变量。
4. 扫描疑似真实密钥、支付商户号、敏感 console 输出和阻塞 TODO。
