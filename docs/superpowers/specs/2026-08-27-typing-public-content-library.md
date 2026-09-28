# 打字记词平台公共内容库设计说明

## 目标

以数据库中的《英语 七年级上册》（译林版）Markdown 为唯一教材来源，解析 `Wordlist (by unit)` 的 8 个单元、410 条词汇记录并写入平台公共内容库。首批为 Unit 1 的 40 条记录生成 4:3、3D 卡通插图和 `loongemily_v3` 英式英语发音。

## 范围

- 入库全部 8 个单元、410 条记录，包括短语和带 `*` 的只要求听读词。
- 保留教材原始顺序、原始行、页码、中文释义、音标、词性和拼写要求。
- Unit 1 生成 40 张 `1024×768` PNG 和 40 条 MP3。
- Unit 2—8 只创建内容记录，媒体保持 `PENDING`。
- 不实现 `/typing` 页面、练习会话、记忆曲线、内容管理后台或线上发布。

## 数据结构

### EnglishContentLibrary

公共英文内容库。保存 slug、标题、类型、语言、来源教材、来源内容哈希、发布状态和排序。

### EnglishContentUnit

内容库内的单元。以 `libraryId + code` 唯一，保存单元编号、标题、教材页码、媒体状态和排序。

### EnglishContentItem

单词或短语。保存：

- `text`：教材英文原文。
- `normalizedText`：用于匹配和幂等导入的规范化文本。
- `itemType`：`WORD` 或 `PHRASE`。
- `translation`、`britishPhonetic`、`partOfSpeech`。
- `isSpellingRequired`：带 `*` 的项目为 `false`。
- `sourceOrder`、`sourcePage`、`sourceRaw`。
- `reviewStatus`：解析后为 `VERIFIED`；无法可靠拆分的项目不得写成已验证。
- `dictionaryEntryId`：仅在独立单词能唯一匹配 ECDICT 时关联。

同一单元以 `unitId + sourceOrder` 唯一；不同单元可重复出现同一词。

### EnglishContentAcceptedAnswer

保存标准答案及将来允许的变体。首批每个项目至少创建一个规范化标准答案。

### EnglishContentMedia

保存项目媒体槽位和生成元数据：

- `kind`：`ILLUSTRATION` 或 `BRITISH_PRONUNCIATION`。
- `status`：`PENDING`、`PROCESSING`、`READY` 或 `FAILED`。
- `mediaAssetId`：就绪后关联通用 `MediaAsset`。
- 图片提示词、生成器、模型、音色、输入哈希、错误信息。

每个项目的每种媒体类型只能有一个当前记录。

### MediaAsset

复用现有通用媒体表。生成素材使用 `sourceType=AI_GENERATED`，不设置 `createdByUserId`，从而保持平台公共归属。音频不写入用户专属的 `AudioAsset`。

## 解析与校对

1. 读取 slug 为 `smartedu-64f242e1-9902-067f-a769-7ed0a761c430` 的教材。
2. 只截取 `Wordlist (by unit)` 到下一个总词表章节之间的 Markdown。
3. 按页标记、Unit 标题和词条版式解析；合并由 Markdown 转换造成的断行。
4. 规范全角标点、重复空格和星号，但保留 `sourceRaw`。
5. 单词优先用 ECDICT 补充或交叉校验；教材中文释义及是否要求拼写始终为权威值。
6. dry-run 必须得到固定计数：Unit 1—8 分别为 `40/46/47/52/20/87/61/57`，总计 `410`。数量漂移时拒绝写库。解析器会修复原 Markdown 中 `be interested in … (8 looks …` 缺失右括号造成的唯一粘连；该计数修正了设计阶段的粗提取值 `396`。
7. 应用模式使用事务 upsert，并记录 Markdown SHA-256；相同来源重复执行不得产生重复数据。

## 图片生成

- 使用内置 `imagegen`，每个词条一次独立生成调用。
- 用途分类：`stylized-concept`。
- 画面：面向中国初中生的清晰概念或动作场景，3D 卡通渲染，温暖自然光，主体明确，背景简洁。
- 禁止英文文字、中文文字、字母标签、Logo 和水印。
- 生成结果复制进 `uploads/typing-content/yl-7a/unit-01/images/`，再以不拉伸方式裁切/缩放到 `1024×768` PNG。
- 最终提示词和文件 SHA-256 写入媒体记录。

## 音频生成

- Provider 音色 ID：`loongemily_v3`。
- 模型：`cosyvoice-v3-flash`。
- 输出：单词或短语原文、正常语速、MP3。
- 通过现有 AI Gateway 的 DashScope Audio 适配器调用；凭据读取项目既有安全配置，不写入源码或日志。
- 文件写入 `uploads/typing-content/yl-7a/unit-01/audio/`，创建平台 `MediaAsset` 后关联词条。
- 生成器按输入哈希幂等；`READY` 且文件存在时默认跳过，显式 `--force` 才替换。

## 可恢复性与验证

- 数据库迁移只新增枚举、表、索引和外键，不删除或改写现有字段。
- 导入器先 dry-run，正式写入后用数据库查询验证 8/410/40。
- 每张图片必须为 PNG、`1024×768`；每条音频必须非空且可被 `ffprobe` 读取。
- Unit 1 必须有 40 个就绪图片槽位和 40 个就绪音频槽位；Unit 2—8 媒体保持待生成。
- 删除新建库记录即可级联删除内容关系；媒体文件和通用媒体记录单独保留，避免误删共享资源。

## 修改边界

允许修改：

- `packages/database/prisma/`
- `packages/database/src/index.ts`
- `packages/database/package.json`
- 根 `package.json`
- `scripts/typing/`
- `docs/superpowers/`
- `uploads/typing-content/yl-7a/`

不修改：

- 用户现有 AI 场景相关改动。
- 支付、钱包、登录、权限、多语言和 CMS。
- 教材原始 Markdown、PDF 和转换后的页图。
- 生产数据库及线上部署配置。
