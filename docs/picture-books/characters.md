# 绘本角色参考图

## 使用

`/storybook` 的“出场角色”可在新建绘本前选择。讨论会提取用户确认的角色名称，通用男孩/女孩会与已选形象匹配；有明确外貌的角色保留外貌描述，可上传或生成形象。点击角色卡片打开选择弹窗。

每个角色的 `styleImages` 按稳定风格标识保存图片。官方小男孩、小女孩各有12个版本（共24张1:1图片），已上传到 `abeiai` R2。新增后台风格或自定义风格没有预制角色图时，用户可上传对应风格图片或生成对应风格形象。

上传当前风格图片保留该角色其他风格；改变外貌描述后创建新的角色身份。图片生成始终先传风格参考图，再传角色身份图。页图使用当前风格的角色图，原有默认模型10张总参考图、后备模型3张总参考图限制沿用；风格占1张，角色至多9张/2张。

## 数据与文件

- 增量 migration `20261003100000_picture_book_character_styles` 增加 JSON `styleImages`，按旧绘本正在使用的风格回填；角色原始 `imageUrl` 保留为身份参考。
- 各旧绘本已保存的角色图片快照保留在 `legacyImageUrl`/`legacyStyle`，同风格打开时保持原图；主动重新选择角色后移除兼容快照。服务端读取角色图仍需校验所有权。
- 图片：`apps/web/public/picture-book-characters/{boy,girl}/{style}.webp`，640×640。API Docker 同时带入这些文件作为模型参考。
- R2归档清单：`character-image-assets.json`；前台官方图地址：`apps/api-core/src/picture-books/picture-book-character-assets.ts`。
- 使用内置 imagegen，每张独立生成。提示词集合见 `character-image-prompts.json`；以平面版身份图和相应官方风格图共同生成变体。
- 无 seed 变更，保留用户作品；场景和物品参考图后续加入。

## 验证

角色针对性测试覆盖风格变体选择、旧绘本图片快照、沟通提取及预选形象匹配、所有权、R2上传、同风格和身份图变更的并发保护。数据库 migration 先以真实数据库事务执行后回滚验证，再执行部署迁移。浏览器使用独立测试绘本验收选择、风格切换、上传、讨论提取、角色和页图生成。

2026-10-03 真实调用：上传黏土版阿明后生成水彩变体，任务携带2张参考图；分镜携带水彩风格、阿明与小红共3张参考图。两次 Abei 2.1 均达到120秒超时，自动转 Qwen Image 3.0 后成功，图片保存到 R2。分镜生成期间切换第2页、打开角色弹窗正常，返回第1页能看到生成结果。验收截图保存在 `/tmp/abei-character-picker.png` 与 `/tmp/abei-character-page.png`；测试绘本和临时角色验收后清理。

前端/API类型检查通过；前端544项测试、绘本及图片模型/账号授权相关106项测试通过；Docker Web/API 构建通过。独立审查后修复命名碰撞，原角色改名不得占用另一角色的名称。

验收命令：

```sh
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/api-core typecheck
pnpm --filter @xueleai/web test
# 在 apps/api-core 中执行；这些测试使用 mock，不连接测试数据库
DATABASE_URL=postgresql://test:test@localhost:3604/test pnpm exec node --import tsx --test tests/picture-book-*.test.ts tests/abeiai-image*.test.ts tests/learner-route-authorization.test.ts
docker compose -p abei build web api-core
docker compose -p abei run --rm --no-deps migrate
```

未运行全量API测试，因上游部分测试硬编码访问 xueleai 332x 端口，违反本项目隔离规则；未运行全局 seed/install，避免覆盖已有配置或无关依赖更新。
