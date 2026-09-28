# Text2Lesson 路由与历史记录设计

## 目标

将英文带学制作台迁移到 `/text2lesson`，将独立学习页迁移到 `/text2lesson/:id`，彻底移除旧页面路由。同时修复登录后偶尔仍显示未登录状态、必须刷新后才出现账号历史的问题。

## 范围

允许修改：

- `apps/web/src/app` 中英文带学页面路由。
- `apps/web/src/components/experience` 中英文带学制作台和学习页链接。
- `apps/web/src/components/shell`、首页与工具清单中的英文带学入口。
- `apps/web/src/lib/auth-actions.ts` 中登录状态变更后的缓存失效处理。
- `apps/web/tests` 中与英文带学 URL、登录态和历史记录相关的测试。

不修改：

- NestJS API 路径 `/api/english-guided-study/**`。
- 数据库 schema、migration 和 seed。
- 支付、钱包、管理员权限及其他 AI 工具页面行为。

## 路由规则

新的唯一页面路由：

- 制作台：`/text2lesson`
- 学习页：`/text2lesson/:id`

删除以下旧页面路由：

- `/experience/english-guided-study`
- `/study/english-guided-study/:id`

不新增 redirect、rewrite、兼容页面或客户端跳转。旧地址由 Next.js 返回 404。

内部业务 API 仍保留 `english-guided-study` 命名，因为本次只迁移用户可见页面 URL。

## 页面结构

`/text2lesson` 不再依赖 `/experience` 路由布局，页面自身使用 `PublicShell`，保持现有公共导航和无页脚工作台布局。

`/text2lesson/:id` 继续使用 `PublicShell` 和现有 `EnglishGuidedStudyLearningPlayer`，仅调整页面目录和所有制作台返回链接。

所有前端入口统一改为 `/text2lesson`，包括：

- 公共导航与移动端 AI 工具菜单。
- 工作台导航。
- 首页学习工具入口。
- 工具列表与产品数据。
- 学习页返回制作台链接。
- 制作台生成的分享和学习链接。

## 登录态

`/text2lesson` 设置为强制动态渲染，并在服务端调用 `getOptionalCurrentUser()`。服务端把当前用户传给 `EnglishGuidedStudyConsole`，作为制作台判断历史来源的唯一依据。

邮箱登录、手机号登录、注册和退出完成后，对公共根布局执行缓存失效，再进行重定向。这样登录后的目标页面不会复用登录前预取的公共布局结果。

制作台监听 `currentUser.id`：

- 用户由空变为有效 ID 时，重新请求服务器账号历史。
- 用户 ID 改变时，清空旧用户历史并请求新用户历史。
- 用户变为空时，立即清空左栏历史。

## 历史记录

未登录状态：

- 不读取 `localStorage` 历史。
- 不请求账号历史接口。
- 左栏显示新用户空白状态和登录入口。
- 以前浏览器中保存的英文带学本地历史不展示，也不自动迁移。

已登录状态：

- 只调用 `/api/english-guided-study/materials` 获取服务器账号历史。
- 不读取、不合并、不写入英文带学本地历史。
- 新生成、编辑或重新生成音频后的材料直接更新当前内存中的账号历史列表。
- 没有材料时显示“暂无账号历史”。

历史请求失败时保留登录状态，左栏显示“账号历史加载失败”，提供重新加载按钮；不能因为请求失败而显示未登录空状态。

## 状态模型

制作台新增明确的历史状态：

```ts
type AccountHistoryStatus = "guest" | "loading" | "ready" | "error";
```

- `guest`：未登录，不展示任何历史。
- `loading`：已登录，正在请求服务器历史。
- `ready`：请求完成，可以为空数组。
- `error`：已登录，但服务器历史请求失败。

账号历史更新只操作 React state，不再调用英文带学历史的 `readHistory()` 或 `writeHistory()`。

## 错误处理

- 页面无法读取登录态时按未登录处理，但公共导航与制作台使用同一次服务端用户结果，避免两处状态不一致。
- 账号历史接口失败时显示中文错误和重试按钮。
- 用户在历史加载期间可以继续录入文稿，但左栏显示加载状态。
- 学习页材料不存在时继续显示现有“学习材料不可用”状态。

## 测试与验收

自动测试覆盖：

1. 制作台链接生成 `/text2lesson` 和 `/text2lesson/:id`。
2. 源码不再引用两个旧页面 URL。
3. 未登录用户得到 `guest` 状态和空历史。
4. 已登录用户只使用服务器历史。
5. 用户 ID 从空变为有效值时触发账号历史加载。
6. 用户退出或切换账号时清空旧历史。
7. 历史接口失败时进入 `error`，而不是 `guest`。

验收命令：

```bash
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web build
```

浏览器验收：

- `/text2lesson` 正常打开制作台。
- `/text2lesson/:id` 正常打开可分享学习页。
- 两个旧地址返回 404。
- 未登录左栏不出现本地历史。
- 登录后无需手动刷新即可显示账号历史。
- 退出后左栏立即回到未登录空白状态。

本次不需要数据库 migration 或 seed 更新。
