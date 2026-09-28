# 101–130 后续任务索引

## 阶段 15：AI 模型预置与快速接入体系

对应文档：

```text
docs/development-plan/15-ai-model-presets.md
```

任务：

```text
101 重构 AI Provider / Model Preset 数据模型
102 预置主流 Provider
103 预置模型能力标签
104 后台 AI Provider 快速配置页
105 Provider 连接测试
106 模型别名绑定
107 AI 场景绑定默认模型
108 Provider 能力检测
109 模型预置版本管理
110 一键初始化 AI 配置
```

---

## 阶段 16：AI 工具模板与场景市场

对应文档：

```text
docs/development-plan/16-ai-tool-templates.md
```

任务：

```text
111 预置基础 AI 工具
112 工具输入 Schema
113 工具模板导入 / 导出
114 工具分类
115 工具详情页标准化
```

---

## 阶段 17：开发者初始化向导

对应文档：

```text
docs/development-plan/17-developer-onboarding.md
```

任务：

```text
116 首次启动检测
117 后台初始化向导
118 环境变量检查页
119 README 升级
```

---

## 阶段 18：模型调用监控与成本统计

对应文档：

```text
docs/development-plan/18-ai-usage-cost-monitoring.md
```

任务：

```text
120 模型调用统计
121 模型成本看板
122 异常告警预留
123 模型调用日志脱敏
```

---

## 阶段 19：插件化与扩展能力

对应文档：

```text
docs/development-plan/19-plugin-extension.md
```

任务：

```text
124 Provider 插件接口
125 工具模板插件接口
126 主题与 UI 配置
```

---

## 阶段 20：Starter Kit 产品化交付

对应文档：

```text
docs/development-plan/20-starter-kit-productization.md
```

任务：

```text
127 示例站点
128 空白模板
129 Demo 数据模板
130 发布版本检查
```

---

## 推荐执行顺序

```text
101–110 先做模型预置和快速接入
111–115 再做 AI 工具模板
116–119 再做开发者初始化向导
120–123 再做调用统计和成本看板
124–126 再做插件化扩展接口
127–130 最后做 Starter Kit 产品化交付
```

## 每次给 Codex 的固定提示模板

```text
请先阅读 AGENTS.md，以及本次任务对应的 development-plan 文档。

本次只执行任务：XXX。

允许修改目录：
- xxx

禁止：
1. 不要实现本任务以外的功能。
2. 不要写入真实 API Key。
3. 不要把模型名硬编码到业务逻辑。
4. 不要绕过模型别名机制。
5. 不要绕过 NestJS 钱包和权限系统。
6. 不要让 FastAPI 直连核心 PostgreSQL。

完成后请运行：
pnpm lint
pnpm typecheck
pnpm test
pnpm build

如果涉及数据库，请运行：
pnpm db:migrate
pnpm db:seed

完成后请输出：
1. 修改文件清单。
2. 实现功能清单。
3. 运行命令结果。
4. 风险和后续建议。
```
