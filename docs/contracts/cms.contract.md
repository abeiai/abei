# CMS 契约

## 资源

第一阶段 CMS 只包含：

1. ArticleCategory
2. Article
3. Page

---

## 状态

Article 和 Page 状态：

```text
DRAFT
PUBLISHED
ARCHIVED
```

前台只能展示：

```text
PUBLISHED
```

---

## Slug

规则：

1. 同一资源类型下唯一。
2. 只能包含小写字母、数字和短横线。
3. 不允许为空。
4. 不允许使用系统保留路由。

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

## 权限

后台 CMS 写操作必须要求管理员登录。  
前台 public 接口不需要登录，但只能返回已发布内容。
