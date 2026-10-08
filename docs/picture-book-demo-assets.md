# 熊猫乐乐的森林朋友

前台入口：资源中心 `/center`，发布为一个系列资源《熊猫乐乐的森林朋友》，作者为虚拟投稿账号“乐乐绘本工作室”。系列共12集独立故事，每集12页正文；带书名的封面用于阅读首屏，不计入正文页数。适合4–7岁亲子阅读。

本地 abei 资源地址：`/c/306f0ed1871f63b9ed7cbbd9`。扩容在原资源上创建新的投稿版本；保留原三集及其审核快照，不创建第二个系列资源。重复执行不会覆盖作品、回退目录或重复审核。

| 绘本 | 伙伴 | 主题 |
| --- | --- | --- |
| 等等我，小兔 | 小兔米米 | 照顾彼此的节奏 |
| 小刺猬的拥抱 | 小刺猬球球 | 尊重边界，表达关心 |
| 松鼠的橡果约定 | 松鼠松果 | 遵守约定，修复信任 |
| 小狐狸说实话 | 小狐狸菲菲 | 诚实与承担责任 |
| 小鹿也会害怕 | 小鹿朵朵 | 表达害怕与互相支持 |
| 最后一块饼干 | 小熊暖暖 | 分享与尊重需要 |
| 浣熊的两种玩法 | 小浣熊淘淘 | 不同意见与共同协商 |
| 小乌龟的长处 | 小乌龟慢慢 | 发现彼此的长处 |
| 猫头鹰想静一静 | 小猫头鹰咕咕 | 尊重安静与独处 |
| 河狸的小桥 | 小河狸木木 | 合作与共同解决问题 |
| 小獾勇敢说不 | 小獾阿斑 | 拒绝与尊重选择 |
| 小鸟的新朋友 | 小鸟啾啾 | 接纳新朋友 |

## 数据和素材

- `scripts/picture-books/lele-series-data.ts`：原三集与完整系列数据；`lele-additional-stories.ts`：新增九集的配文、角色描述与分镜。完整144页正文，旁白文稿与配文一致。
- `apps/web/public/picture-book-demos/lele-*/`：每集封面加12张正文插画，共156张；小狐狸第1–9页与小熊第3、5–9、11页使用修正道具状态的 `-v2.webp`。
- 使用内置 imagegen 工具生成，每页独立成图；WebP 压缩为最长边 1024px，质量 86。
- `apps/web/public/picture-book-demos/series-cover.webp`：1600×900 系列资源封面，作为作者名下的 MediaAsset 上传到已配置的 R2。
- 12集保存为虚拟账号名下的正式 PictureBook，通过现有资源保存、投稿和管理员审核服务发布。公开资源使用审核快照，阅读遵循现有登录与学习者访问流程。`/storybook` 不再提供独立的静态示范区。
- 不需要 schema migration；运行专用导入脚本新增账号、作品、资源及审核记录。首次导入默认关闭密码登录；用户可单独授权为投稿账号设置登录密码。导入脚本不会重置已启用登录的账号密码或自动接管账号。
- 正文配文与图片分离，由播放器显示简体中文。正文插画无文字；封面直接包含书名和系列名。每集封面书名及12页正文使用“叶知晴”旁白，全文与配文一致，共156段音频。

## 叶知晴配音

固定系统音色 `yezhiqing_v3.1`，模型 `qwen-audio-3.1-tts-flash`，正常语速，24kHz单声道MP3。音频登记为工作室账号名下的 `TTS_OUTPUT` 素材并保存至R2；公开播放器通过现有鉴权音频接口读取已审核快照，支持逐页播放和自动翻页。工作室默认声音设为叶知晴。

`scripts/picture-books/narrate-lele-series.mjs` 是本地运营素材制作脚本，限制abei数据库、3603网关、固定账号和同一12集资源。服务商请求ID、真实用量和文件校验记录保存于 `lele-narration-manifest.json`；不包含凭据。运营制作不修改用户钱包，不伪造前台付费任务。

生成和发布分开执行。生成清单原子保存，已完成文件复用；生成成功而上传中断时复用原服务商结果。失败响应和请求结果未知时均停止，需人工核对并显式记录恢复决定，最多恢复三次。正式发布前读取验证全部156个R2文件，逐本使用版本条件写入，仅更改音频字段；文字、插画与目录必须和原稿一致。拒绝记录阻止自动重审，既存待审快照必须严格等于预定配音版本，再通过现有课件变更审核服务及管理员操作日志公开。课程目录及资源地址保持一致。

在abei API容器内运行，先按下方导入步骤准备完整12集的 `books.json`，再复制 `lele-import.mjs`、`lele-narration.mjs` 和 `narrate-lele-series.mjs` 至同一目录：

```bash
docker compose exec -T api-core node /tmp/abei-lele-narration/narrate-lele-series.mjs --admin-id="$ABEI_ADMIN_ID" --data=/tmp/abei-lele-narration/books.json --output=/tmp/abei-lele-narration/audio --mode=generate
docker compose exec -T api-core node /tmp/abei-lele-narration/narrate-lele-series.mjs --admin-id="$ABEI_ADMIN_ID" --data=/tmp/abei-lele-narration/books.json --output=/tmp/abei-lele-narration/audio --mode=publish
```

完整生成清单和服务商结果文件应保存到本地运营备份，容器重建前保留恢复目录。原作品导入器仍保留严格的原稿校验；它不会覆盖已配音或已修改的作品。

## 插画提示词

参考用户提供的森林插画作为风格参考，封面作为各册的固定角色参考。正文每页生成时使用以下共通要求，再加数据文件中对应的 `imagePrompt`；`caption` 仅提供情节上下文，不写进画面。

```text
Use case: illustration-story. Asset type: a single finished square children's picture-book illustration, full bleed, 1024x1024.
Warm traditional gouache, painted and printed paper textures, speckled pigments, wax-pencil hatching, imperfect organic shapes, tall teal forest trunks, layered luminous lime/ochre foliage, dark botanical foreground, golden sunlight.
Lele is a plump young black-and-white giant panda with creamy white round face and pear-shaped white belly, black rounded ears, oval black eye patches, black arms and legs, tiny black nose and rosy cheeks. Lele always wears only a short muted brick-red neckerchief tied to the right.
Mimi is a small creamy white rabbit, long ears with pink interiors, tiny eyes, rosy cheeks, faded teal blue overalls.
Qiuqiu is small with cinnamon brown textured spines and a round cream face and belly, no clothing.
Songguo is a small rusty orange squirrel, cream muzzle and belly, big curled fluffy tail, tiny sage green crossbody satchel.
Only the specified pair of animals may appear; characters absent from the current story beat stay out of frame.
One coherent scene per image. No humans, background animals, text, captions, watermark, page numbers, labels, frames, panels or montage.
Preserve the reference characters' appearances, proportions and clothing; draw a new composition for each page. Never copy the cover scene.
```

封面提示词见同一数据文件中的 `coverPrompt`。各册用不同的季节色彩和道具辅助区分，但保持乐乐与绘画肌理一致。

## 带标题的封面

使用内置 imagegen 编辑原封面，保留角色、服饰、表情、森林和肌理。封面顶部的小字统一为“熊猫乐乐的森林朋友”，其下以大号、圆润手绘字体分别写“等等我，小兔”“小刺猬的拥抱”“松鼠的橡果约定”。书名为暖米白色，配深青色细描边或轻阴影；文字位于树冠区，不遮挡角色头部。左右留出 6% 安全边距。不添加作者名、出版社、其他标语或水印。

标题区沿用统一的字体、字号、配色和行距，整个文字组下移约画面高度 6%；系列名起点距顶约 8%–10%，主书名位于画面高度 14%–29% 区域。角色与核心道具保持当前位于下半部的构图，不继续移动或缩放。文字与角色头部之间保留疏朗的森林空间，角色身体完整，背景连续，不使用横向分隔或纯色标题条。

正式作品封面路径不含缓存查询参数，以兼容公开播放器的图片地址校验。阅读顺序为“封面、1–12页正文”，导航和计数分别展示，正文页数仍为 12。正文对话统一使用中文双引号“”。

## 投稿导入

`scripts/picture-books/publish-lele-series.mjs` 仅供受信任的本地运营者执行，必须传入现有有效超级管理员 ID。脚本限制数据库为abei的3604/abei，拒绝覆盖连接目标的查询参数，使用独立数据库锁防止并发，拒绝接管其他账号和绕过已拒绝的审核。恢复草稿或待审状态时核对完整资源信息与目录。发布前验证全部156个页面图片地址已在本项目Web中可访问；需先完成静态资源构建部署。

在已经构建并运行的 **abei** API 容器内使用现有服务。先准备数据，再复制脚本、辅助模块、数据和封面：

```bash
pnpm --filter @xueleai/web exec tsx -e 'import {leleSeriesBooks} from "../../scripts/picture-books/lele-series-data.ts"; import {writeFileSync} from "node:fs"; writeFileSync("/tmp/abei-lele-series.json",JSON.stringify(leleSeriesBooks))'
docker compose exec -T api-core mkdir -p /tmp/abei-lele-import
docker compose cp scripts/picture-books/publish-lele-series.mjs api-core:/tmp/abei-lele-import/publish-lele-series.mjs
docker compose cp scripts/picture-books/lele-import.mjs api-core:/tmp/abei-lele-import/lele-import.mjs
docker compose cp /tmp/abei-lele-series.json api-core:/tmp/abei-lele-import/books.json
docker compose cp apps/web/public/picture-book-demos/series-cover.webp api-core:/tmp/abei-lele-import/cover.webp
docker compose exec -T api-core node /tmp/abei-lele-import/publish-lele-series.mjs --admin-id="$ABEI_ADMIN_ID" --data=/tmp/abei-lele-import/books.json --cover=/tmp/abei-lele-import/cover.webp
```

执行前设置 `ABEI_ADMIN_ID` 为目标abei数据库中现有有效超级管理员的ID。导入支持初始3集或完整12集；已发布3集时调用现有 `saveCourse` 创建12集新版本，再提交并审核，原资源地址保持一致。不伪造AI预审结果，不直接更新资源公开状态；管理员审核及操作日志均使用现有业务服务。

## 新增九集的插画提示词

新增封面以第一集封面为角色、字体与绘画肌理参考，统一小号系列名与大号书名，角色位于下半部。每张正文以本集封面为角色参考单独生成，清除全部文字，按该页分镜绘制新场景，避免沿用封面的道具状态。每张生成记录与完整提示词保存在 `scripts/picture-books/lele-generation-manifest.json`；逐页情节见上述数据文件。小狐狸前九页另行去除修补补丁，第十页以后才出现补丁；小熊的饼干保持只有一块，第九页才掰开，修正提前分享或凭空多出饼干的画面。

## 系列资源封面提示词

使用内置 imagegen，以三本现有封面为角色、绘画肌理和标题字体参考，生成一个新的 16:9 场景，保存为上述 `series-cover.webp`。

```text
Use case: illustration-story. Asset type: a single finished LANDSCAPE 16:9 resource-series cover, 2048x1152, full bleed. Input images 1–3 are STYLE, exact CHARACTER and TITLE-TYPOGRAPHY REFERENCES only; make a new wide cover for this series.
Scene: a warm luminous forest with tall teal trunks, lime/ochre leaves, gold sunlight, printed gouache and speckled paper textures. The one panda Lele from the references wears a brick-red neckerchief. His three friends are the small white rabbit with teal overalls, the cinnamon-spined cream-faced hedgehog with no clothes, and the rusty orange squirrel with a sage-green satchel and big fluffy tail. Exactly ONE panda and ONE of each of those three friends. They sit or stand warmly together in a loose arc on the forest floor, smiling at one another, panda taller than all three friends. One coherent forest scene, all four characters fully visible in the lower half, no humans or other animals.
Typography: exact Simplified Chinese main title "熊猫乐乐的森林朋友", as one large centered line in the upper-middle area, using the same warm creamy ivory hand-painted rounded Chinese lettering and subtle deep-teal shadow as the references. Make it clearly readable as a resource-center thumbnail, with safe margins 6%, and a generous gap above the animals. Do NOT include any of the three individual book titles, no smaller subtitle, no author, no publisher, no badges, no page numbers, no watermark or border. Preserve the warm traditional picture-book style, not 3D or slick vector.
Landscape wide composition with title fully inside 16:9 boundaries. This image represents a single SERIES containing three independent friendship books, not three panels or three separate covers.
```
