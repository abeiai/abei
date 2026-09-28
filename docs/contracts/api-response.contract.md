# API 响应格式契约

所有 NestJS API 必须使用统一响应格式。

## 成功响应

```ts
{
  code: 0,
  message: "成功",
  data: unknown
}
```

## 失败响应

```ts
{
  code: number,
  message: string,
  data: null
}
```

## 示例

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "id": "demo"
  }
}
```

```json
{
  "code": 40001,
  "message": "请求参数错误",
  "data": null
}
```

## 禁止

不得直接返回：

```json
{
  "error": "xxx"
}
```

不得直接暴露：

1. Prisma error
2. SQL error
3. JWT malformed
4. Stack trace
5. Internal server error
```
