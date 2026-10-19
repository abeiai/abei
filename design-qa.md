# 登录与注册样式验收

- 原始参考：https://bootstrapget.com/demos/mac-ui-admin-dashboard/login.html 与 https://bootstrapget.com/demos/mac-ui-admin-dashboard/signup.html 。
- 参考站在浏览器读取时超时；使用下载的原始 HTML、CSS、SVG 与字体在本机渲染，未修改参考布局。
- 首轮源图：`/tmp/abei-reference-login.png`；实现图：`output/auth-redesign/login-email-first.png`。
- 首轮并排对照：`output/auth-redesign/comparison-initial-login.png`，左右均为 1280×720 CSS px，截图密度 1。
- 源图在左，实现图在右；状态均为空白邮箱登录表单。

## 首轮发现

- P2：内层表单继承全局卡片悬停阴影，产生第二层卡片边界；需提高局部样式优先级移除。
- P2：固定登录内容区让邮箱的主按钮与底部注册入口距离过大；保留 320px 内容高度，将主按钮对齐底部并缩小两项操作间距。

## 允许的产品差异

- 保留阿贝智能品牌、橙色主题、中文及四种登录方式。
- 卡片从参考的 380px 调为 420px，以容纳四种登录标签；保持 32px 内边距、20px 圆角及右侧布局。
- 注册保留原有邮箱验证码和手机方式，因此比三字段参考页更高，短屏允许页面滚动。
- 登录不恢复此前要求移除的重复标题或返回首页按钮。

## 修复与复验

- 两项 P2 均已修复：局部卡片样式覆盖旧悬停效果，实际计算阴影为 `none`；主按钮在 320px 内容区底部对齐，与切换页面入口的间距为 12px。
- 桌面源图：`output/auth-redesign/source-login-desktop.png`、`source-signup-desktop.png`；实现：`login-desktop.png`、`signup-desktop.png`。每张均为 1280×900，CSS 视口 1280×900，密度 1。
- 手机源图：`source-login-mobile.png`、`source-signup-mobile.png`；实现：`login-mobile.png`、`signup-mobile.png`。均位于同一输出目录，每张为 390×844，CSS 视口 390×844，密度 1。
- 状态：源图及实现均为空白邮箱表单；实现保留产品已有字段和登录标签。
- 全图并排证据：`comparison-login-desktop.png`、`comparison-signup-desktop.png`、`comparison-login-mobile.png`、`comparison-signup-mobile.png`；每幅左为参考、右为实现，以 1:1 原像素组合。
- 卡片局部对照：`comparison-login-card.png`；同一桌面截图裁出完整卡片，未缩放，以便核对字体、圆角、边框、按钮和间距。
- 已打开上述所有并排图与局部图对照；没有剩余需要修复的 P0/P1/P2。

## 设计检查

- 字体：保留项目 Mulish 与系统中文回退；品牌 28px，字段和正文 14px；无文本截断。保留原有中文与功能文案，未添加参考页的英文占位说明。
- 布局：桌面靠右、窄屏居中；内边距 32px，手机 24px，圆角 20px。输入框维持项目 44px 高度，验证码组合行可用。
- 色彩：主色实际为 `#ff7b31`；背景 SVG 的蓝色矢量色板改为橙色，未更改路径、内嵌插图或构图。品牌从既有后台公开配置读取。
- 影像：复用真实源 SVG，缩放清晰，无占位图、外链背景请求或新增手绘替代图。
- 登录切换：桌面四种方式的外框均 576px，手机均 604px，内容区均 320px；两个视口均无横向溢出。
- 注册：保留昵称、邮箱、验证码、密码及手机注册；390px 视口无横向溢出。
- 交互：四种登录方式、两种注册方式切换正常；“立即注册”和“去登录”互相跳转正常；输入与键盘聚焦可用。
- 页面控制台日志为空。未发送验证码、创建真实账户或提交凭据。
- 本地公众号登录仍是关闭/未配置状态，扫码实际登录不在本次样式验收范围内。
- 已通过 `pnpm --filter @xueleai/web typecheck`、`docker compose --project-name abei build web`，本地 Web 容器健康；纯展示改动未跑全量测试，无 migration/seed。

## 修改文件

- `apps/web/src/app/login/page.tsx`、`apps/web/src/app/register/page.tsx`：启用局部插画布局。
- `apps/web/src/components/shell/auth-panel.tsx`、`auth-panel.module.css`：共享品牌外框、表单样式、响应式布局及描边入口。
- `apps/web/src/components/auth/user-login-form.tsx`：固定内容区的样式挂载点。
- `apps/web/src/components/auth/register-form.tsx`：移除多余返回首页入口。
- `apps/web/public/images/auth/login-background.svg`：引用原始背景并适配橙色矢量色板，来源注明在 SVG 首行。
- `design-qa.md`：视觉对照及验证记录。

final result: passed
