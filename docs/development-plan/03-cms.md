# 阶段 3：CMS 内容管理闭环

## 目标

实现简单 CMS，包括：

1. 文章分类管理
2. 文章管理
3. 单页管理

本阶段结束后，管理员可以在后台创建内容，前台可以展示已发布内容。

---

## 允许修改目录

```text
apps/web/
apps/api-core/
packages/database/
```

---

## 数据模型

### ArticleCategory

```text
id
name
slug
description
sortOrder
isVisible
createdAt
updatedAt
```

### Article

```text
id
categoryId
title
slug
summary
coverImage
content
status
seoTitle
seoDescription
publishedAt
createdAt
updatedAt
```

状态：

```text
DRAFT
PUBLISHED
ARCHIVED
```

### Page

```text
id
title
slug
content
status
seoTitle
seoDescription
publishedAt
createdAt
updatedAt
```

状态：

```text
DRAFT
PUBLISHED
ARCHIVED
```

---

## 后台功能

### 文章分类管理

```text
/admin/categories
```

必须支持：

1. 分类列表
2. 新增分类
3. 编辑分类
4. 删除分类
5. 设置是否显示
6. 设置排序值

---

### 文章管理

```text
/admin/articles
```

必须支持：

1. 文章列表
2. 新增文章
3. 编辑文章
4. 删除文章
5. 发布文章
6. 下架文章
7. 设置分类
8. 设置封面
9. 设置 SEO 标题
10. 设置 SEO 描述

第一版文章编辑器可以使用普通 textarea 或简单 Markdown textarea。  
不得在本阶段引入复杂可视化编辑器作为阻塞项。

---

### 单页管理

```text
/admin/pages
```

必须支持：

1. 单页列表
2. 新增单页
3. 编辑单页
4. 删除单页
5. 发布单页
6. 下架单页
7. 设置 SEO 标题
8. 设置 SEO 描述

---

## 前台功能

### 文章列表

```text
/articles
```

只展示：

```text
PUBLISHED 状态文章
```

### 文章详情

```text
/articles/[slug]
```

只允许访问：

```text
PUBLISHED 状态文章
```

草稿和归档内容不得展示。

### 单页详情

```text
/pages/[slug]
```

只允许访问：

```text
PUBLISHED 状态单页
```

---

## Slug 规则

1. 同一资源类型下 slug 唯一。
2. slug 只能包含小写字母、数字和短横线。
3. slug 不允许为空。
4. slug 不允许使用系统保留路由。

保留 slug：

```text
admin
login
register
dashboard
api
articles
pages
settings
```

---

## API 需求

建议接口：

```text
GET    /cms/categories
POST   /cms/categories
PATCH  /cms/categories/:id
DELETE /cms/categories/:id

GET    /cms/articles
POST   /cms/articles
PATCH  /cms/articles/:id
DELETE /cms/articles/:id
POST   /cms/articles/:id/publish
POST   /cms/articles/:id/archive

GET    /cms/pages
POST   /cms/pages
PATCH  /cms/pages/:id
DELETE /cms/pages/:id
POST   /cms/pages/:id/publish
POST   /cms/pages/:id/archive

GET /public/articles
GET /public/articles/:slug
GET /public/pages/:slug
```

后台写接口必须要求管理员登录。  
前台 public 接口只能返回已发布内容。

---

## Seed 要求

必须创建：

1. 默认文章分类
2. 至少一篇已发布文章
3. 至少一个已发布单页

---

## 禁止事项

本阶段禁止实现：

1. 多语言文章
2. 可视化页面搭建器
3. 协同编辑
4. 复杂媒体库
5. 审批工作流
6. AI 写作
7. 付费内容

---

## 验收标准

1. 管理员可以创建分类。
2. 管理员可以编辑分类。
3. 管理员可以删除分类。
4. 管理员可以创建文章。
5. 管理员可以发布文章。
6. 前台可以看到已发布文章。
7. 前台不能看到草稿文章。
8. 管理员可以创建单页。
9. 管理员可以发布单页。
10. 前台可以访问已发布单页。
11. 所有后台写操作需要管理员登录。

---

## 验收命令

```bash
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```
