# AI 工具模板契约

## 工具模板字段

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
sortOrder
```

## 输入 Schema

工具表单必须通过 schema 渲染，不得为每个工具写死独立表单。

示例：

```json
{
  "fields": [
    {"name": "topic", "label": "主题", "type": "text", "required": true},
    {"name": "tone", "label": "语气", "type": "select", "required": false, "options": ["专业", "轻松", "营销", "学术"]}
  ]
}
```

## 支持字段类型

```text
text
textarea
select
number
switch
```

## 工具模板导入导出

允许导入导出：

```text
工具名称
slug
分类
描述
inputSchema
promptTemplate
modelAlias
costRule
```

禁止导入导出：

```text
API Key
用户历史任务
支付信息
管理员信息
```

## 执行原则

1. 工具通过 modelAlias 调用模型。
2. 工具执行必须经过 NestJS。
3. 前端不得直接调用 Provider。
4. 点数不足时不得执行。
5. 模型未配置时返回中文提示。
