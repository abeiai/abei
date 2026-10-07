# 熊猫乐乐的森林朋友

前台入口：`/storybook`。三本独立故事，每本 12 页正文；带书名的封面用于示范卡片及阅读首屏，不计入正文页数。适合 4–7 岁亲子阅读。

| 绘本 | 伙伴 | 主题 |
| --- | --- | --- |
| 等等我，小兔 | 小兔米米 | 照顾彼此的节奏 |
| 小刺猬的拥抱 | 小刺猬球球 | 尊重边界，表达关心 |
| 松鼠的橡果约定 | 松鼠松果 | 遵守约定，修复信任 |

## 数据和素材

- `apps/web/src/lib/picture-book-demos.ts`：逐页配文、旁白文稿、分镜提示词和图片路径。
- `apps/web/public/picture-book-demos/{lele-rabbit,lele-hedgehog,lele-squirrel}/`：每本 `cover.webp` 和 `01.webp`–`12.webp`，共 39 张插画。
- 使用内置 imagegen 工具生成，每页独立成图；WebP 压缩为最长边 1024px，质量 86。
- 示例由前台静态数据直接提供，访客无需登录即可翻阅。复用现有播放器，不创建用户作品，不需要数据库迁移或 seed。
- 正文配文与图片分离，由播放器显示简体中文。正文插画无文字；封面直接包含书名和系列名。已准备逐页旁白文稿，当前示范不含音频。

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

使用内置 imagegen 编辑原封面，保留角色、服饰、表情、森林和肌理。封面顶部的小字统一为“熊猫乐乐的森林朋友”，其下以大号、圆润手绘字体分别写“等等我，小兔”“小刺猬的拥抱”“松鼠的橡果约定”。书名为暖米白色，配深青色细描边或轻阴影；文字位于树冠区，不遮挡角色头部。左右留出 6% 安全边距，顶部留出 4% 安全边距。不添加作者名、出版社、其他标语或水印。

标题区沿用统一的字体、字号、配色和位置。角色与核心道具整体下移，等比例缩小约 15%；最高耳尖从画面高度 34%–36% 处开始，与书名下沿保持至少画面高度 9% 的间距。上方保留疏朗的树冠和青绿色树干，正文主画面位于下方三分之二区域；保留角色完整身体和连续森林背景，不使用横向分隔或纯色标题条。

前台封面路径附加 `?v=composition-v2` 刷新图片缓存。阅读顺序为“封面、1–12页正文”，导航和计数分别展示，正文页数仍为 12。
