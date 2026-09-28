# 131–155 语音能力任务索引

## 阶段 21：阿里云语音能力底座

对应文档：

```text
docs/development-plan/21-aliyun-audio-foundation.md
```

任务：

```text
131 新增阿里云语音 Provider Preset
132 预置 CosyVoice / Sambert 模型
133 实现 DashScope Audio Adapter
134 对象存储接入语音文件
135 语音任务状态机
```

## 阶段 22：前台语音工具体验

对应文档：

```text
docs/development-plan/22-frontend-audio-tools.md
```

任务：

```text
136 前台语音合成工具页
137 前台声音设计工具页
138 前台声音复刻工具页
139 我的音色库
140 我的音频任务
```

## 阶段 23：语音计费与扣费

对应文档：

```text
docs/development-plan/23-audio-billing-usage.md
```

任务：

```text
141 语音计费规则表
142 语音任务预冻结与结算
143 语音用量统计
```

## 阶段 24：语音安全、授权与审核

对应文档：

```text
docs/development-plan/24-audio-safety-review.md
```

任务：

```text
144 声音复刻授权记录
145 敏感用途提示与使用协议
146 管理员审核开关
147 违规音色处理
```

## 阶段 25：后台语音运营管理

对应文档：

```text
docs/development-plan/25-audio-admin-operations.md
```

任务：

```text
148 语音模型管理
149 用户音色管理
150 语音任务管理
151 语音计费配置
152 语音审核列表
```

## 阶段 26：语音产品化模板

对应文档：

```text
docs/development-plan/26-audio-productization.md
```

任务：

```text
153 预置语音工具模板
154 语音工具 Schema
155 语音 Demo 数据
```

## 推荐执行顺序

```text
第一批：131–135
先打通阿里云语音底座、对象存储、任务状态机。

第二批：141–143
先把语音计费扣费和统计做稳。

第三批：144–147
补齐声音复刻授权和审核。

第四批：136–140
做前台语音合成、声音设计、声音复刻和我的音色库。

第五批：148–152
做后台语音运营管理。

第六批：153–155
做语音产品化模板和 Demo。
```

## 每次给 Codex 的固定提示模板

```text
请先阅读 AGENTS.md，以及本次任务对应的 development-plan 文档和 contracts 文档。

本次只执行任务：XXX。

允许修改目录：
- xxx

禁止：
1. 不要实现本任务以外的功能。
2. 不要写入真实 DASHSCOPE_API_KEY。
3. 不要让前端直接调用阿里云。
4. 不要让 FastAPI 直连核心 PostgreSQL。
5. 不要绕过 NestJS 钱包和权限系统。
6. 不要绕过 AudioTask 状态机。
7. 不要绕过声音复刻授权声明。
8. 不要默认公开用户复刻音色。

完成后请运行：
pnpm lint
pnpm typecheck
pnpm test
pnpm build

如果涉及数据库，请运行：
pnpm db:migrate
pnpm db:seed

如果修改 FastAPI，请运行：
ruff check .
mypy .
pytest

完成后请输出：
1. 修改文件清单。
2. 实现功能清单。
3. 运行命令结果。
4. 风险和后续建议。
```
