# 阶段 26：语音产品化模板

## 目标

将语音合成、声音设计、声音复刻能力产品化为可复用 AI 工具模板，并提供 Demo 数据。

## 允许修改目录

```text
apps/web/
apps/api-core/
packages/database/
docs/
scripts/
```

## 本阶段任务

```text
153 预置语音工具模板
154 语音工具 Schema
155 语音 Demo 数据
```

## 任务 153：预置语音工具模板

### 推荐工具

```text
文章转语音
短视频口播生成
课程讲稿转语音
绘本朗读音频生成
客服欢迎语生成
品牌声音设计
我的声音复刻
```

### 每个工具包含

```text
工具名称
slug
工具分类
工具描述
输入 Schema
默认模型别名
默认音色策略
计费规则
是否启用
排序值
```

### 要求

1. 工具通过 seed 创建。
2. 不覆盖开发者自定义工具。
3. 工具默认使用模型别名。
4. 语音复刻工具必须包含授权声明。
5. 工具文案使用简体中文。

## 任务 154：语音工具 Schema

### 新增字段类型

```text
voice-select
audio-upload
slider
audio-preview
format-select
```

### 示例 Schema

```json
{
  "fields": [
    {
      "name": "text",
      "label": "合成文本",
      "type": "textarea",
      "required": true
    },
    {
      "name": "voiceId",
      "label": "选择音色",
      "type": "voice-select",
      "required": true
    },
    {
      "name": "speed",
      "label": "语速",
      "type": "slider",
      "min": 0.5,
      "max": 2,
      "default": 1
    }
  ]
}
```

### 要求

1. 前端可以根据 schema 渲染语音工具表单。
2. 后端可以校验语音工具输入。
3. `voice-select` 只能显示用户可用音色。
4. `audio-upload` 必须限制格式和大小。
5. `slider` 参数必须有范围校验。

## 任务 155：语音 Demo 数据

### Demo 内容

```text
语音合成示例工具
声音设计示例工具
声音复刻示例工具
音色库说明文章
语音工具单页
语音计费示例配置
语音安全协议页面
```

### 禁止包含

```text
真实 API Key
真实用户声音样本
真实支付商户信息
名人或公众人物声音样本
侵权音频素材
```

### 要求

1. Demo 数据可以通过 seed 创建。
2. 可以重复执行。
3. 不覆盖开发者已有数据。
4. 可以被 `template:blank` 清理。
5. 文案为简体中文。

## 本阶段禁止事项

```text
不放入真实声音样本
不放入真实 API Key
不使用公众人物声音示例
不绕过授权声明
不把 Demo 数据与系统基础数据强绑定
```

## 验收标准

```text
seed 可以创建语音工具模板
语音工具 Schema 可以渲染表单
voice-select 字段可用
audio-upload 字段可用
Demo 数据不包含真实密钥或真实声音样本
template:blank 可以清理语音 Demo 数据
```

## 验收命令

```bash
pnpm db:migrate
pnpm db:seed
pnpm seed:demo
pnpm template:blank
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
