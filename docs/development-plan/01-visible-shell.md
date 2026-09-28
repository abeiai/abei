# 阶段 1：前后台可见页面

## 目标

尽快让项目通过浏览器看到前台和管理后台雏形。

本阶段可以使用 mock 数据，不要求真实数据库 CRUD。  
重点是页面、路由、布局、导航和中文界面。

---

## 允许修改目录

```text
apps/web/
```

---

## 需要完成

### 1. 前台页面

创建以下路由：

```text
/
首页

/articles
文章列表

/articles/[slug]
文章详情

/pages/[slug]
单页详情

/login
前台用户登录

/register
前台用户注册

/dashboard
用户中心首页
```

首页第一版包含：

1. Hero 区
2. 产品介绍
3. 最新文章
4. 功能亮点
5. 登录 / 注册入口

---

### 2. 管理后台页面

创建以下路由：

```text
/admin/login
管理员登录

/admin
管理后台首页

/admin/categories
文章分类管理

/admin/articles
文章管理

/admin/pages
单页管理

/admin/settings
系统设置
```

后台第一版必须包含：

1. 左侧导航
2. 顶部栏
3. 管理员信息占位
4. 退出登录按钮占位
5. 表格列表样式
6. 新增按钮
7. 编辑按钮
8. 删除按钮
9. 状态标签
10. 分页占位

---

### 3. UI 约束

必须使用：

```text
TypeScript
TailwindCSS
shadcn/ui
```

所有文字必须为简体中文。

---

## 禁止事项

本阶段禁止实现：

1. 真实登录逻辑
2. 真实 CMS CRUD
3. 支付
4. AI
5. 多语言
6. 复杂权限

---

## 验收页面

```text
/
 /articles
 /articles/demo
 /pages/about
 /login
 /register
 /dashboard
 /admin/login
 /admin
 /admin/categories
 /admin/articles
 /admin/pages
 /admin/settings
```

---

## 验收命令

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm dev
```

通过浏览器确认所有页面可以访问，并且主要文字为简体中文。
