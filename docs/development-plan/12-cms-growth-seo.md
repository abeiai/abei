# 阶段 12：CMS 增强与内容增长

## 目标

增强 CMS 的内容生产、SEO 和增长能力。

本阶段让项目从“能发文章”升级为“适合做内容增长和搜索引擎收录”。

## 允许修改目录

```text
apps/web/
apps/api-core/
packages/database/
docs/
uploads/
scripts/
```

## 本阶段任务

```text
080 媒体上传
081 接入对象存储
082 Markdown 编辑器升级
083 文章标签
084 文章封面管理
085 SEO 字段增强
086 sitemap.xml
087 robots.txt
088 文章预览
089 定时发布
090 首页内容区块配置
```

## 任务 080：媒体上传

### 要求

```text
1. 只有管理员可上传。
2. 限制文件类型。
3. 限制文件大小。
4. 返回可访问 URL。
5. 记录媒体文件信息。
```

推荐模型：

```text
MediaAsset
- id
- filename
- originalName
- mimeType
- size
- url
- storageProvider
- createdByAdminId
- createdAt
```

## 任务 081：接入对象存储

### 第一版支持

```text
S3-compatible
```

可兼容：

```text
Cloudflare R2
阿里云 OSS S3 兼容方式
腾讯云 COS S3 兼容方式
MinIO
```

### 要求

```text
1. 存储配置来自环境变量。
2. 本地开发可以继续使用本地 uploads。
3. 不在数据库中存储敏感密钥。
```

## 任务 082：Markdown 编辑器升级

### 推荐

```text
Vditor
```

### 要求

```text
1. 支持 Markdown 编辑。
2. 支持预览。
3. 支持图片插入。
4. 不影响已有文章内容。
```

## 任务 083：文章标签

### 推荐模型

```text
Tag
- id
- name
- slug
- createdAt
- updatedAt

ArticleTag
- articleId
- tagId
```

### 页面

```text
/admin/tags
```

## 任务 084：文章封面管理

### 要求

```text
1. 后台可以上传或选择封面。
2. 前台文章列表显示封面。
3. 前台文章详情显示封面。
4. 未设置封面时显示默认样式。
```

## 任务 085：SEO 字段增强

### 建议字段

```text
seoTitle
seoDescription
seoKeywords
canonicalUrl
noIndex
ogTitle
ogDescription
ogImage
```

### 要求

```text
1. 前台页面正确输出 title。
2. 前台页面正确输出 meta description。
3. 支持 Open Graph 基础标签。
```

## 任务 086：sitemap.xml

### 包含

```text
首页
文章列表页
已发布文章
已发布单页
```

### 禁止

```text
草稿文章
归档文章
草稿单页
归档单页
```

## 任务 087：robots.txt

### 要求

```text
1. 允许前台内容被抓取。
2. 禁止后台路径被抓取。
3. 包含 sitemap 地址。
```

## 任务 088：文章预览

### 要求

```text
1. 预览链接需要管理员登录。
2. 普通用户不能访问草稿预览。
3. 预览不影响文章发布状态。
```

## 任务 089：定时发布

### 要求

```text
1. 支持 scheduledAt 字段。
2. 定时任务将内容从 DRAFT 改为 PUBLISHED。
3. 前台未到时间不可访问。
```

## 任务 090：首页内容区块配置

### 建议配置

```text
Hero 标题
Hero 副标题
CTA 文案
功能亮点
最新文章数量
```

### 要求

```text
1. 设置保存到数据库。
2. 首页读取系统设置。
3. 未配置时有默认值。
```

## 本阶段禁止事项

```text
1. 不做可视化建站器。
2. 不做协同编辑。
3. 不做复杂审批流。
4. 不做多语言 CMS。
5. 不做全文搜索引擎集成，除非另起阶段。
```

## 验收标准

```text
1. 管理员可以上传图片。
2. 文章可以选择封面。
3. Markdown 编辑器可正常编辑和预览。
4. 文章可以设置标签。
5. 前台输出 SEO meta。
6. sitemap.xml 正常生成。
7. robots.txt 正常生成。
8. 草稿可以预览但不公开。
9. 定时发布可用。
10. 首页内容可以通过后台配置。
```

## 验收命令

```bash
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
