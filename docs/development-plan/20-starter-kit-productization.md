# 阶段 20：Starter Kit 产品化交付

## 目标

将项目从“可运行代码”打磨为“可交付的 AI SaaS Starter Kit”。

本阶段重点是示例站点、空白模板、Demo 数据、发布检查和文档完整性。

---

## 允许修改目录

```text
apps/web/
apps/api-core/
packages/database/
docs/
scripts/
```

---

## 本阶段任务

```text
127 示例站点
128 空白模板
129 Demo 数据模板
130 发布版本检查
```

---

## 任务 127：示例站点

### 目标

内置一个可展示、可体验、可用于演示的 AI 写作工具站。

### 示例站点包含

```text
首页
工具列表
文章
单页
价格页
用户中心
后台配置
几个 AI 工具模板
```

### 要求

1. 示例内容为简体中文。
2. 不包含真实 API Key。
3. 不包含真实支付商户信息。
4. 示例工具可以在配置模型后直接使用。
5. 示例内容可以被清理。

---

## 任务 128：空白模板

### 命令

```bash
pnpm template:blank
```

### 目标

清空示例内容，只保留基础系统。

### 清空内容

```text
示例文章
示例单页
示例 AI 工具
示例分类
示例任务
示例订单
```

### 保留内容

```text
系统基础配置
管理员账号
Provider Preset
Model Preset
必要模型别名
基础权限和系统表
```

### 要求

1. 执行前必须有确认机制或文档警告。
2. 不删除管理员账号。
3. 不破坏数据库结构。
4. 输出中文执行结果。

---

## 任务 129：Demo 数据模板

### 命令

```bash
pnpm seed:demo
```

### 创建内容

```text
示例分类
示例文章
示例单页
示例 AI 工具
示例充值套餐
示例系统设置
示例模型别名
```

### 要求

1. 可以重复执行。
2. 不覆盖开发者已有内容。
3. 对 slug 冲突有处理。
4. 输出中文执行结果。

---

## 任务 130：发布版本检查

### 命令

```bash
pnpm release:check
```

### 检查内容

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

### 要求

1. 检查失败时返回非 0 退出码。
2. 输出中文检查结果。
3. 明确指出失败项。
4. 不打印真实密钥。

---

## 本阶段禁止事项

```text
1. 不把真实 API Key 写入 Demo。
2. 不把真实支付信息写入 Demo。
3. 不删除生产数据。
4. 不在 release:check 中输出敏感信息。
5. 不把示例站点与业务逻辑强绑定。
```

---

## 验收标准

```text
1. 示例站点可以正常展示。
2. Demo 数据可以初始化。
3. 空白模板可以清理示例数据。
4. release:check 可以运行。
5. env example 完整。
6. README 与实际命令一致。
7. 项目可以作为 Starter Kit 交付给新开发者。
```

---

## 验收命令

```bash
pnpm seed:demo
pnpm release:check
pnpm template:blank
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
