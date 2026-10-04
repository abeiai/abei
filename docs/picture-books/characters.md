# 绘本角色参考图

## 使用

`/storybook` 的“出场角色”先列出讨论中确认的故事名字，也可手动补充名字。新提取的角色不自动绑定默认图片；点击某个角色，再为它选择、上传或生成参考形象。故事角色 `name` 与形象库名称独立，服务端以 `referenceName` 返回所选形象名称；选择、更换、上传以及切换绘画风格均保持故事名字。多个角色可共用同一参考形象，弹窗只标记当前角色选择的图片。

上传表单的“形象名称”用于保存参考图片，可以与故事名字不同。例如故事名字“小明”，参考形象“小男孩”或“蓝衣儿童”。

每个角色的 `styleImages` 按稳定风格标识保存图片。官方小男孩、小女孩各有22个版本（共44张1:1图片），已上传到 `abeiai` R2。新增后台风格或自定义风格没有预制角色图时，用户可上传对应风格图片或生成对应风格形象。

上传当前风格图片保留该参考形象其他风格；改变形象名称或外貌描述后创建新的参考形象，故事名字保持不变。图片生成始终先传风格参考图，再传角色身份图。页图使用当前风格的角色图，原有默认模型10张总参考图、后备模型3张总参考图限制沿用；风格占1张，角色至多9张/2张。

## 数据与文件

- 增量 migration `20261003100000_picture_book_character_styles` 增加 JSON `styleImages`，按旧绘本正在使用的风格回填；角色原始 `imageUrl` 保留为身份参考。
- 各旧绘本已保存的角色图片快照保留在 `legacyImageUrl`/`legacyStyle`，同风格打开时保持原图；主动重新选择角色后移除兼容快照。服务端读取角色图仍需校验所有权。
- 图片：`apps/web/public/picture-book-characters/{boy,girl}/{style}.webp`，640×640。API Docker 同时带入这些文件作为模型参考。
- R2归档清单：`character-image-assets.json`；前台官方图地址：`apps/api-core/src/picture-books/picture-book-character-assets.ts`。
- 使用内置 imagegen，每张独立生成。提示词集合见 `character-image-prompts.json`；以平面版身份图和相应官方风格图共同生成变体。
- 无 seed 变更，保留用户作品；场景和物品参考图后续加入。

## 2026-10-04 风格扩充

新增经典油画、像素艺术、黑白水墨、彩色水墨、木偶定格、皮影剪影、蓝印花布、瓦当陶纹、木板年画、敦煌壁画。风格目录共22种，官方角色共44张。

10张新风格图以原有平面插画为参考，保留女孩、小狗的身份、服饰、姿势及森林布局，仅转换绘画媒介。20张新角色图以对应风格图和原有角色平面图共同生成，保留正面全身居中的布局。全部为640×640 WebP，并归档到 abeiai R2；风格图提示词和归档地址分别见 `style-image-prompts.json`、`style-image-assets.json`。

本地系统配置通过管理员接口追加10种风格，保留原目录顺序、描述、启用状态及图片地址。原配置备份于 `/tmp/abei-style-expansion-config-backup.json`；无 migration 或全局 seed 变更。

验证：Web/API typecheck、绘本风格/角色/风格参考针对性测试44项、Docker Web/API构建通过。30张新图均验证640×640 WebP、R2读取成功且与本地SHA-256一致；浏览器验证全部22种风格加载、后台列表、蓝印花布角色选择及切换油画后角色名保留。截图：`/tmp/abei-new-style-picker.png`、`/tmp/abei-new-style-characters.png`；风格总览：`/tmp/abei-new-style-previews.png`。

本次没有更新依赖、数据库结构、支付或权限流程，未运行 install、全量 lint、全量测试及数据库 migrate/seed。

## 2026-10-04 经典油画参考更新

依据用户提供的油画样图，重绘经典油画风格图及小男孩、小女孩两张角色图。采用堆叠厚油彩、刮刀笔触、立体颜料肌理及鲜明冷暖色块；风格图保留原有女孩、小狗的身份、服饰、姿势和森林布局，角色图保留原有正面全身居中的布局。

参考原图保存于 `references/classic-oil-impasto.webp`；内置 imagegen 的实际生成提示词与输入参考路径记录于 `style-image-prompts.json`、`character-image-prompts.json`。三张成品均为640×640 WebP，R2归档地址更新于相应资产清单和官方角色 URL 映射。仅更新本地系统配置中 `classic-oil` 的描述与参考图，原配置备份于 `/tmp/abei-classic-oil-config-backup.json`。

验证：`pnpm --filter @xueleai/web typecheck` 通过；风格、角色、风格参考测试44项通过；三张R2图片与本地SHA-256一致；Docker Web/API构建和容器健康检查通过；浏览器确认经典油画卡片和两张角色图加载新地址。截图：`/tmp/abei-classic-oil-picker.png`、`/tmp/abei-classic-oil-characters.png`。本次无 migration/seed，未更新依赖，未运行 install、全量 lint 或全量测试。

## 验证

角色针对性测试覆盖风格变体选择、旧绘本图片快照、沟通提取及预选形象匹配、所有权、R2上传、同风格和身份图变更的并发保护。数据库 migration 先以真实数据库事务执行后回滚验证，再执行部署迁移。浏览器使用独立测试绘本验收选择、风格切换、上传、讨论提取、角色和页图生成。

2026-10-03 真实调用：上传黏土版阿明后生成水彩变体，任务携带2张参考图；分镜携带水彩风格、阿明与小红共3张参考图。两次 Abei 2.1 均达到120秒超时，自动转 Qwen Image 3.0 后成功，图片保存到 R2。分镜生成期间切换第2页、打开角色弹窗正常，返回第1页能看到生成结果。验收截图保存在 `/tmp/abei-character-picker.png` 与 `/tmp/abei-character-page.png`；测试绘本和临时角色验收后清理。

同日角色姓名交互修正：真实对话提取“小明、张华、Tom”后先显示三个名字；小明、张华绑定同一“小男孩”图仍保持独立，Tom 上传“蓝衣男孩形象”后名字不变，切换黏土和水彩后仍保留三人名字。截图 `/tmp/abei-character-names.png`。执行前后端 typecheck，以及 `pnpm exec node --import tsx --test tests/picture-book-characters.test.ts tests/picture-book-plan.test.ts`（在 `apps/api-core`），30项通过；Docker Web/API 构建和浏览器验收通过。本次未再跑全量测试，改动限于角色命名与选图交互，无 migration/seed 变更。

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
