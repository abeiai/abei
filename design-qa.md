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
- 色彩：主色实际为 `#ff7b31`；背景 SVG 的蓝色矢量色板改为橙色，保留路径和构图。品牌从既有后台公开配置读取。
- 影像：复用源 SVG 背景，内嵌人物按后续要求替换为中国男孩；不依赖外链图片。
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

## 中国男孩插画更新

- 修改范围仅为 `apps/web/public/images/auth/login-background.svg` 内嵌人物图片；登录、注册共用该背景，无代码、数据库、migration 或 seed 变更。
- 使用内置 imagegen 编辑原透明 PNG，将人物替换为短黑发的中国男孩；保留 3D 风格、书桌、电脑、椅子、杯子与橙色主题。
- 生成原件：`/Users/ericword/.codex/generated_images/01a11e00-a9f2-70c1-85be-f7bfa3339fa1/exec-fc880d68-fb5f-4054-9c23-0b3c78dff0cc.png`；缩至 966px 宽并保留透明通道，内嵌保存到上述项目 SVG。
- 最终提示词如下（内置工具模式，编辑目标为原内嵌 PNG）：

```text
Use case: precise-object-edit.
Edit target: the attached transparent 483×444 PNG illustration used inside an existing website background.
Primary request: replace the female character with a Chinese boy, about 10–12 years old, naturally recognizable East Asian facial features, short black hair, friendly focused expression, seated at the laptop.
Style: preserve the existing polished soft 3D clay/cartoon rendering, proportions, materials and lighting.
Keep: identical camera, canvas aspect ratio, subject placement and scale, seated pose, hands using laptop, wooden desk, wooden chair, laptop, cup and all furniture geometry. Keep the desk and chair fully visible exactly as in the source. Preserve the boy's blue trousers; use a simple warm orange/cream casual shirt and neutral shoes, suited to the existing orange website theme.
Background: true transparency, including around furniture legs; preserve all transparent cutout areas. No scenery, colored rectangle, gradient backdrop, lettering or extra objects.
Only change the person into a Chinese boy. Remove the long orange hair and feminine face/clothing. Do not crop or enlarge the scene.
```

- 验证通过：`pnpm --filter @xueleai/web typecheck`、`docker compose --project-name abei build web`；重建本地 Web 容器，健康检查通过并重载 Nginx。
- SVG 解析验证通过；与修改前对比，除人物位图和来源注释外，所有矢量节点、颜色与图片摆放属性完全一致。内嵌 PNG 保留真实透明通道。
- 已在实际 `http://localhost:3600/login` 和 `/register` 查看新图。截图为 `output/auth-redesign/login-chinese-boy.png`（1280×720）与 `register-chinese-boy.png`（1280×900）；男孩、橙色背景及表单显示正常。
- 仅图片变更，未运行全量测试或全量 lint；未修改登录流程，未进行线上部署。

## 居家亲子场景更新

- 新增图片 `apps/web/public/images/auth/login-home-family.webp`，登录和注册共享样式改为引用此图；保留橙色与既有表单布局。
- 男孩双脚并排落地、双腿不交叉，父母在身后观看电脑；居家背景包含窗帘、书架、绿植、地毯与木家具。
- 使用内置 imagegen；图 1 为当前背景的栅格化编辑目标，图 2 为原男孩人物参考。生成原件位于 `/Users/ericword/.codex/generated_images/01a11e00-a9f2-70c1-85be-f7bfa3339fa1/exec-184d551f-a7a3-495b-9fc0-56d030c70d31.png`，转为 WebP 保存到项目后使用。
- 最终提示词：

```text
Use case: precise-object-edit.
Asset type: wide background illustration for a real login and signup webpage, 1920×1080 landscape.
Input 1 is the existing background to redesign. Input 2 is a close-up identity/style reference for the Chinese boy.
Requested changes: make the boy sit normally at his laptop, both thighs parallel, both knees bent at about 90 degrees, both lower legs vertical and BOTH feet flat on the floor side by side, NO crossed legs. Put his Chinese mother and father standing behind him, watching his laptop with warm, supportive expressions. Exactly three people. Keep the boy's short black hair, friendly youthful face, orange and cream T-shirt and blue trousers from Input 2. Give the parents natural East Asian features and casual home clothing in warm neutral shades.
Redesign the old abstract oversized desk and floating tech graphics into a cozy contemporary family home study corner: a normal wooden desk and chair, a sunlit window with soft curtains, a low bookshelf with a few books, an indoor plant, a soft rug and a gentle orange curved accent on a cream wall. All furniture in plausible perspective and scale. Make the family the main illustration, larger and clearer than the tiny boy in Input 1.
Style: polished soft 3D clay/cartoon like Input 2, rounded friendly forms, warm sunlight, tasteful orange, cream, light wood and small green accents. Simple restrained background patterns, calm welcoming home feeling.
Composition is essential: anchor the ENTIRE family, all faces, laptop, desk, chair and feet within the LEFT HALF of the canvas (x approximately 70–900 of 1920). Place parents behind the boy so all three faces are visible. Keep all heads well inside the canvas and both boy's feet visible with floor beneath them. Home details may softly frame this left area. Right half (x 1000–1920) must remain mostly empty uniform light warm cream (#f5f3f0), with a gentle natural transition into the home illustration, reserved for the existing actual form rendered separately.
Do not draw a form, card, logo, UI, writing, numbers or text. No extra people, crossed legs, floating limbs, giant computers, futuristic dashboards, decorative tech overlays, clutter or dark background. Opaque image, no transparency.
```

- 验证通过：`pnpm --filter @xueleai/web typecheck`、`docker compose --project-name abei build web`；本地 Web 容器健康，Nginx 配置检查和重载成功。
- 实际页面已加载 `login-home-family.webp`；背景按高度缩放（`auto 100%`），避免宽屏裁掉人物头部与脚部。1920×900 视口的文档宽度为 1920，无横向溢出。
- 浏览器截图：`output/auth-redesign/login-home-family.png` 和 `register-home-family.png` 为 1280×900；`login-home-family-wide.png` 为 1920×900。已检查正常坐姿、父母观看、居家细节、橙色主题及表单显示。
- 仅图片和背景样式调整，未跑全量测试或全量 lint；无登录逻辑、API、数据库、migration 或 seed 变更，未部署线上。

final result: passed
