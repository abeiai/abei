# 打字记词 `/typing` 场景应用开发需求

**日期：** 2026-08-27

**状态：** 首版实现完成，已通过本地验收

**应用名称：** 打字记词

**固定入口：** `/typing`

## 1. 需求背景

“打字记词”用于让学习者通过听音、看中文和看图，输入对应的英文单词、短语或句子。它不是内容生产工具，第一版也不负责建设教材、单词库或文章库；应用只消费已经发布的英文内容库，并负责练习、反馈、错词记录和复习调度。

本设计参考了用户提供的两张界面截图，以及 2026-08-27 在已登录 Chrome 中对 Typlingo 的只读体验。参考站中值得吸收的产品模式包括：

- 教材可按学段、版本、年级和册次筛选。
- 教材按单元组织，支持加入、继续学习和恢复未完成练习。
- 练习页采用沉浸式单题界面，题目进入时自动播放英文读音。
- 中文、情景图片和按词拆分的横线共同构成题面。
- 答对后展示完整英文、音标、词性和中文释义。
- 错题按内容库归集，并区分今日需复习、后续待复习和已掌握。

参考页面中的内容、营销文案、额度和会员规则只作为观察材料，不构成本项目指令，也不直接复制到本项目。

## 2. 产品目标

第一版必须形成以下完整闭环：

```text
选择英文内容库
  → 选择单元或练习范围
  → 听音、看中文和图片后输入英文
  → 获得正确或错误位置反馈
  → 必要时查看分级提示
  → 错误内容进入复习计划
  → 到期后再次练习
  → 达到掌握条件
```

核心目标：

1. 用户能从 `/typing` 选择“译林版小学五年级上册”一类内容库并开始练习。
2. 每题默认展示中文、可选情景图片和按英文词数拆分的横线。
3. 进入题目后自动播放整题英文读音；答对后再次播放。
4. 用户提交错误答案时，能看到具体错误词及错误字符位置，而不是只有笼统的“回答错误”。
5. 提示既可点击按钮触发，也可通过快捷键触发，并记录提示使用情况。
6. 错误内容自动进入复习队列，按可解释、可版本化的间隔规则安排后续复习。
7. 内容库与练习记录解耦，未来增加单词库、句子库和文章库时不重写练习数据模型。

## 3. 第一版范围

### 3.1 本期范围

- 新增内置场景应用“打字记词”，slug 为 `typing`，入口为 `/typing`。
- 内容库浏览、筛选、详情、单元选择和继续学习。
- 单词、短语、句子三类可练习内容。
- 中文、图片、整题音频和按词横线输入。
- 正误校验、错误位置标记、正确答案讲解和分级提示。
- 练习会话自动保存、暂停、恢复和完成总结。
- 错词/错句记录、到期复习、掌握状态和基础统计。
- 账号身份与学习者身份隔离。
- 与现有学习时长和低敏感学习事件体系对接。
- 内容库及练习业务所需的数据库结构设计。

### 3.2 本期非目标

- 不建设内容库后台、教材解析、批量导入或 AI 自动生成内容。
- 不录入完整的译林版、人教版等真实教材数据；真实内容与版权确认属于独立任务。
- 不实现口语评分、语音识别、拼图、指法键盘或多人竞赛。
- 不实现积分、排行、打卡奖励、会员额度或独立支付逻辑。
- 不实现自定义记忆算法编辑器或机器学习推荐模型。
- 不实现多语言界面、多语言题库或国际化路由。
- 不修改现有钱包、支付、CMS 和 AI Gateway。

## 4. 已确认的产品决策

### 4.1 身份与授权

- `/typing` 复用现有登录态和 `ProfileSubject`，不新增账号体系。
- 主账号可以使用自己的独立进度；学习者身份使用自己的独立进度。
- 学习者访问前必须获得 `typing` 场景授权。
- 服务端从可信身份上下文确定 `userId`、`learnerId` 和场景权限，不接受客户端指定记录归属。
- 同一主账号下的不同学习者之间不得共享错词、复习时间和练习历史。

### 4.2 内容库与课程

- 英文内容库是平台可复用内容，不等同于现有用户创作的 `Course`。
- 内容库可以可选关联现有 `LearningMaterialTextbook`，用于记录教材来源，但练习不得直接解析教材 PDF 或 Markdown。
- `/typing` 只读取状态为已发布的内容库和内容项。
- 内容修改必须有版本号；历史练习始终关联当时使用的内容版本。

### 4.3 练习默认值

- 默认练习模式为“中文提示听写英文”。
- 默认每轮 20 题；不足 20 题时使用实际数量。
- 默认顺序为“到期复习优先，其次新内容按单元顺序”。
- 默认自动播放整题音频，答对后再次播放。
- 默认显示情景图片；内容项没有图片时不显示空占位。
- 默认严格检查字母、空格、大小写和标点，但把错误类型分开呈现。
- 默认不启用浏览器拼写检查、自动完成和自动纠错。

## 5. 信息架构与路由

| 路由 | 用途 | 登录要求 |
| --- | --- | --- |
| `/typing` | 内容库选择、继续学习、今日复习入口 | 浏览可公开，开始练习需登录 |
| `/typing/libraries/[libraryId]` | 内容库详情、单元与练习范围选择 | 浏览可公开，进度需登录 |
| `/typing/practice/[sessionId]` | 沉浸式练习页 | 必须登录并校验会话归属 |
| `/typing/review` | 全部到期错词/错句与复习队列 | 必须登录 |
| `/typing/history` | 练习记录和基础趋势 | 必须登录 |

路由不得使用 `/experience/typing` 或 `/tools/typing` 作为主入口。后台场景配置仍使用 `AiScenario.slug = "typing"`，前台固定映射到 `/typing`。

## 6. 页面需求

### 6.1 `/typing` 内容库选择页

页面顶部只展示简洁标题“打字记词”和与当前操作有关的信息，不使用大幅营销 Hero 或长篇功能说明。

登录用户优先看到：

1. 今日待复习数量与“开始复习”按钮。
2. 最近学习的内容库、单元、完成进度和“继续练习”按钮。
3. 内容库筛选区。
4. 内容库列表。

筛选项：

- 内容类型：全部、教材同步、单词库、文章库。
- 学段：小学、初中、高中、其他。
- 版本：如人教版、译林版、外研版；选项由 API 返回，不在前端写死。
- 年级：与当前学段联动。
- 册次：上册、下册、全一册。
- 搜索：支持内容库名称和标签。

内容库卡片至少展示封面、名称、版本、年级、册次、单元数、可练习内容数，以及当前用户进度。未登录用户点击“开始练习”后跳转登录并带回原 `next` 地址。

### 6.2 内容库详情页

内容库详情页展示：

- 封面、名称、版本、年级、册次和内容统计。
- 单元目录，每个单元展示内容项数量、新内容数量、待复习数量和完成比例。
- “继续上次练习”“开始本单元”“只复习错题”入口。
- 练习范围选择：全部、指定单元、未学习、到期复习。
- 每轮题量：10、20、30、全部；默认 20。

用户有未完成会话时，点击开始按钮先弹出：

- 继续上次进度。
- 放弃旧会话并重新开始。

“放弃”只结束旧会话，不删除已经提交的作答记录和复习状态。

### 6.3 沉浸式练习页

练习页使用全屏工作区，不套用三栏 AI 生成器布局。

顶部栏包含：

- 退出/暂停。
- 内容库与单元名称。
- 本轮有效练习时长。
- 当前题号/总题数和进度条。
- 音频与练习设置入口。

主区域从上到下为：

1. 中文题面。
2. 可选情景图片，桌面端建议最大宽度 620px，使用圆角矩形。
3. 按英文 token 拆分的输入横线与固定标点。
4. 当前反馈信息。

底部固定操作区只保留：

- 重新播放读音。
- 查看提示。
- 快捷键说明。

不在第一版加入收藏、上一题、跳题和多种练习模式，避免破坏记忆调度与统计口径。退出时自动保存当前未提交输入到浏览器会话内；服务端不长期保存未提交答案正文。

### 6.4 答对后的讲解状态

答对后保持当前题，不立即自动跳转，并按词展示：

- 英文单词。
- 音标；优先展示当前音频口音对应的音标。
- 词性标签。
- 当前语境中的中文释义。
- 正确的大小写和标点。

同时再次播放整题读音。用户按 Enter 或点击“下一题”后进入下一题。音频播放失败不得阻塞进入下一题。

### 6.5 错误反馈状态

提交错误时：

- 正确 token 使用正常色或成功色。
- 错误 token 的横线和输入文字使用错误色。
- 通过字符串对齐标出替换、缺少和多余字符的位置。
- 大小写错误和标点错误使用警告色，与拼写错误区分。
- 焦点回到第一个错误 token，并保留其他已输入内容。
- 显示简短提示，如“第 3 个单词第 2 个字母不正确”。
- 不直接展示完整正确答案。

同一题再次提交仍然错误时，提示按钮提升为主要操作，但不强制用户查看答案。

## 7. 输入、校验与快捷键规则

### 7.1 Token 和输入槽位

- 一个可输入英文词对应一个输入槽位和一条横线。
- 标点作为不可输入 token 单独渲染，不计入横线数量。
- 连字符词和含撇号的缩写默认视为一个 token，例如 `e-friend`、`don't`。
- 输入空格时移动到下一词；退格键在当前槽位为空时回到上一词。
- 用户也可以点击任意横线移动焦点。
- 移动端使用实际 `<input>`，不得只依赖隐藏键盘捕获元素。
- 每个输入框提供可访问名称，例如“第 2 个单词，共 6 个单词”。

### 7.2 规范化与比较

提交前执行以下无损规范化：

- 去除首尾空白。
- 连续空白折叠为一个空格。
- 弯引号统一为标准撇号。
- 全角英文标点转换为对应半角标点。
- Unicode 使用 NFC 规范化。

服务端以已发布内容版本和可接受答案列表为准进行校验。默认结果分为：

- `CORRECT`：字母、大小写、空格和标点全部正确。
- `SPELLING_ERROR`：字母缺少、多余、替换或顺序错误。
- `CASE_ERROR`：仅大小写错误。
- `PUNCTUATION_ERROR`：仅标点错误。
- `WHITESPACE_ERROR`：词边界或空格错误。
- `INCOMPLETE`：存在未输入 token。

可接受答案用于确有多种正确表达的内容，不用于把普通拼写错误判为正确。

### 7.3 固定快捷键

| 操作 | 快捷键 | 说明 |
| --- | --- | --- |
| 提交答案 / 下一题 | `Enter` | 答题状态提交；答对讲解状态进入下一题 |
| 重新播放读音 | `Shift + Space` | 避免与正常空格输入冲突 |
| 查看下一级提示 | `Ctrl/⌘ + /` | 与提示按钮等价 |
| 暂停或退出确认 | `Esc` | 不直接丢弃会话 |

第一版不开放自定义快捷键。不得占用浏览器刷新、打印、历史记录和系统隐藏窗口等高冲突组合键。

### 7.4 分级提示

每题最多三级提示：

1. **结构提示：** 显示每个词的首字母和字符数。
2. **定位提示：** 揭示第一个错误 token 的完整单词，其他词保持隐藏。
3. **答案提示：** 展示完整答案、音标和释义，并要求用户重新完整输入一次才能完成本题。

使用任一级提示都记录 `hintLevel`。使用答案提示后，即使最终输入正确，也按“需要复习”处理，不直接提高记忆阶段。

## 8. 练习状态机

```text
LOADING
  → READY（题面可见并自动播音）
  → TYPING
  → CHECKING
      ├─ INCORRECT → TYPING / HINT_SHOWN → CHECKING
      └─ CORRECT_REVEAL → ADVANCING → READY

任意可交互状态
  → PAUSED
  → 恢复原状态或结束为 ABANDONED

最后一题 CORRECT_REVEAL
  → COMPLETED
```

状态要求：

- `CHECKING` 期间禁止重复提交。
- 每次提交必须携带客户端幂等键，重复请求不得重复增加错误次数或修改两次复习计划。
- 只有服务端确认后才能进入 `CORRECT_REVEAL`。
- 切换标签页不自动结束会话，但不计入有效练习时长。
- 会话超过 30 分钟没有有效活动后标记为过期，重新进入时允许恢复到最后已确认题目。

## 9. 错误记录与记忆曲线

### 9.1 记录口径

以下任一情况将内容项标记为需要复习：

- 本轮第一次提交错误。
- 使用任一级提示。
- 到期复习时再次提交错误。

同一题连续多次提交错误时：

- 每次提交保留一条作答事实。
- 当前练习题只产生一次 `lapse`，避免用户反复按 Enter 把遗忘次数无限放大。
- 记录总尝试次数、错误类型、错误 token/字符位置、耗时和提示级别。
- 默认不长期保存用户输入的完整答案正文。

### 9.2 第一版复习间隔

第一版采用可解释、可版本化的阶段间隔，不声称等同于某一特定科学算法：

| 阶段 | 下次复习时间 | 状态 |
| --- | --- | --- |
| 0 | 本轮后续再次出现，至少间隔 3 题 | 学习中 |
| 1 | 1 天后 | 学习中 |
| 2 | 3 天后 | 复习中 |
| 3 | 7 天后 | 复习中 |
| 4 | 15 天后 | 复习中 |
| 5 | 30 天后 | 复习中 |
| 6 | 60 天后 | 已掌握 |

调度规则：

- 新内容首次答对且未使用提示：进入阶段 1。
- 答错后最终答对：保持阶段 0，并在本轮后续再次出现。
- 阶段 0 再次答对且未使用提示：进入阶段 1。
- 到期复习答对且未使用提示：前进一个阶段。
- 到期复习答错：阶段后退两级，最低为阶段 0，并增加一次 `lapseCount`。
- 使用提示完成：不前进阶段；答案提示会退回阶段 0。
- 阶段 6 到期复习答对后保持已掌握，并将下次抽查时间顺延 90 天。

复习队列排序：

1. 已逾期内容。
2. 当前阶段较低的内容。
3. `lapseCount` 较高的内容。
4. `dueAt` 较早的内容。
5. 同等条件下按内容库单元顺序。

所有状态保存 `algorithmVersion`。后续切换 FSRS 等算法时必须通过显式迁移或惰性升级处理，不能悄悄改变历史计划。

### 9.3 复习页

`/typing/review` 展示：

- 今日需复习、明日待复习、已掌握数量。
- 按内容库筛选。
- 错误次数、最近错误时间、当前阶段和下次复习时间。
- “开始到期复习”按钮。

第一版不提供批量删除学习记录。单项“重置进度”属于破坏性操作，必须二次确认，并只重置当前身份对该内容项的记忆状态。

## 10. 英文内容库数据结构

内容层必须独立于 `/typing`，建议使用 `EnglishContent*` 命名。逻辑关系如下：

```text
LearningMaterialTextbook（可选来源）
  └─ EnglishContentLibrary
       └─ EnglishContentUnit（支持父子层级）
            └─ EnglishContentItem
                 ├─ EnglishContentToken
                 ├─ EnglishContentAcceptedAnswer
                 └─ EnglishContentMedia → MediaAsset
```

### 10.1 `EnglishContentLibrary`

表示一个可选择的英文内容库，例如“译林版小学五年级上册”。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | String | 主键 |
| `slug` | String | 唯一、仅小写字母数字和短横线 |
| `name` | String | 内容库名称 |
| `summary` | String? | 简短说明 |
| `contentType` | Enum | `TEXTBOOK`、`VOCABULARY`、`ARTICLE`、`MIXED` |
| `educationStage` | Enum | `PRIMARY`、`JUNIOR_HIGH`、`SENIOR_HIGH`、`OTHER` |
| `subject` | String | 第一版固定为英语，但不硬编码在 UI |
| `version` | String? | 教材版本，如译林版 |
| `grade` | String? | 年级 |
| `volume` | Enum? | `FIRST`、`SECOND`、`FULL` |
| `coverUrl` | String? | 封面；后续可改为媒体外键 |
| `sourceTextbookId` | String? | 可选关联 `LearningMaterialTextbook` |
| `tags` | String[] | 主题与检索标签 |
| `contentVersion` | String | 已发布内容版本标识 |
| `status` | Enum | `DRAFT`、`PUBLISHED`、`ARCHIVED` |
| `sortOrder` | Int | 展示顺序 |
| `publishedAt` | DateTime? | 发布时间 |
| `createdAt` / `updatedAt` | DateTime | 审计时间 |

约束：

- `slug` 唯一且遵守项目保留路由规则。
- 只有 `PUBLISHED` 可被前台读取。
- `contentVersion` 在影响练习答案、顺序或媒体的发布变更时必须变化。
- 归档内容库不可新开练习，但已有历史记录仍可查看。

### 10.2 `EnglishContentUnit`

表示单元、课、文章分组等层级节点。

| 字段 | 说明 |
| --- | --- |
| `id`、`libraryId` | 主键与内容库外键 |
| `parentId` | 可选父节点，支持“Unit → Lesson”两级结构 |
| `kind` | `UNIT`、`LESSON`、`ARTICLE_GROUP`、`SECTION` |
| `name` | 如 `Unit 1 Goldilocks and the three bears` |
| `summary` | 可选简短说明 |
| `sortOrder` | 同级排序 |
| `status` | 草稿、已发布、已归档 |

同一内容库下不允许出现父子循环。第一版前台最多展示两级，数据结构允许后续扩展。

### 10.3 `EnglishContentItem`

表示最小可管理内容。文章通过父项与子句项表达，实际练习以 `isPracticeEnabled = true` 的项为单位。

| 字段 | 说明 |
| --- | --- |
| `id`、`libraryId`、`unitId` | 主键和归属 |
| `parentItemId` | 文章与句子、段落与句子的父子关系 |
| `type` | `WORD`、`PHRASE`、`SENTENCE`、`PARAGRAPH`、`ARTICLE` |
| `text` | 标准英文答案 |
| `normalizedText` | 服务端生成的检索/比较值 |
| `translation` | 中文释义或整句翻译 |
| `prompt` | 可选中文题面；为空时使用 `translation` |
| `phonetic` | 单词项或短语项的整体音标，可选 |
| `partOfSpeech` | 单词项词性，可选 |
| `difficulty` | 1–5 的内容难度，可选 |
| `sourceRef` | 教材页码、栏目等来源定位，不对普通用户强制展示 |
| `isPracticeEnabled` | 是否可进入练习队列 |
| `version` | 内容项版本号 |
| `sortOrder` | 单元内顺序 |
| `status` | 草稿、已发布、已归档 |

不使用 `titleZh`、`translationZh` 一类多语言字段。第一阶段界面固定简体中文，`translation` 和 `prompt` 的语义已明确为中文。

### 10.4 `EnglishContentToken`

用于稳定渲染横线、讲解卡和错误位置，不在运行时用简单空格临时分词。

| 字段 | 说明 |
| --- | --- |
| `id`、`itemId` | 主键与内容项外键 |
| `kind` | `WORD` 或 `PUNCTUATION` |
| `text` | 标准 token 文本 |
| `normalizedText` | 比较值 |
| `translation` | 当前语境释义，可选 |
| `phonetic` | 当前口音的默认音标，可选 |
| `phoneticUs` / `phoneticUk` | 可选美式/英式音标 |
| `partOfSpeech` | 词性，可选 |
| `dictionaryEntryId` | 可选关联现有 `DictionaryEntry` |
| `startOffset` / `endOffset` | 在完整英文文本中的字符区间 |
| `sortOrder` | token 顺序 |

内容发布时必须校验 token 拼接结果与 `EnglishContentItem.text` 一致。词典关联只用于补充数据，发布后的 token 仍保存自己的快照，避免词典更新改变历史教材内容。

### 10.5 `EnglishContentAcceptedAnswer`

用于确有多个标准答案的题目。

字段包括 `itemId`、`text`、`normalizedText`、`matchMode`、`isPrimary` 和 `sortOrder`。每个可练习内容至少有一个主答案，主答案通常与 `EnglishContentItem.text` 相同。

### 10.6 `EnglishContentMedia`

统一关联现有 `MediaAsset`：

| 字段 | 说明 |
| --- | --- |
| `itemId` | 内容项外键 |
| `tokenId` | 可选；词级音频时填写 |
| `mediaAssetId` | 现有媒体资源外键 |
| `role` | `PROMPT_IMAGE`、`ITEM_AUDIO`、`TOKEN_AUDIO` |
| `accent` | `US`、`UK`、`NEUTRAL`，仅音频使用 |
| `sortOrder` | 多媒体排序 |

图片必须包含替代文本；音频至少有时长和可用状态。媒体不可用时练习仍可继续，但页面要给出简洁中文提示。

### 10.7 内容示例

```json
{
  "library": {
    "slug": "yilin-primary-grade-5-first",
    "name": "译林版小学五年级上册",
    "contentType": "TEXTBOOK",
    "educationStage": "PRIMARY",
    "version": "译林版",
    "grade": "五年级",
    "volume": "FIRST",
    "contentVersion": "2026.1"
  },
  "unit": {
    "name": "Unit 1",
    "sortOrder": 10
  },
  "item": {
    "type": "SENTENCE",
    "text": "I get up at six thirty.",
    "translation": "我六点半起床。",
    "isPracticeEnabled": true,
    "version": 1,
    "tokens": [
      { "kind": "WORD", "text": "I", "phonetic": "/aɪ/", "translation": "我" },
      { "kind": "WORD", "text": "get", "phonetic": "/ɡet/", "translation": "进行；得到" },
      { "kind": "WORD", "text": "up", "phonetic": "/ʌp/", "translation": "起来" },
      { "kind": "WORD", "text": "at", "phonetic": "/æt/", "translation": "在" },
      { "kind": "WORD", "text": "six", "phonetic": "/sɪks/", "translation": "六" },
      { "kind": "WORD", "text": "thirty", "phonetic": "/ˈθɜːti/", "translation": "三十" },
      { "kind": "PUNCTUATION", "text": "." }
    ]
  }
}
```

## 11. 打字练习业务数据结构

```text
ProfileSubject
  ├─ TypingLibraryProgress
  ├─ TypingPreference
  ├─ TypingReviewState ── EnglishContentItem
  └─ TypingPracticeSession
       └─ TypingPracticeSessionItem
            └─ TypingAttempt
```

### 11.1 统一身份键

所有 `Typing*` 用户数据保存：

- `userId`：主账号归属。
- `learnerId`：学习者身份时填写。
- `subjectKey`：服务端生成的稳定键，格式为 `account:<userId>` 或 `learner:<learnerId>`。

唯一约束使用 `subjectKey`，避免 PostgreSQL 可空 `learnerId` 在复合唯一键中的语义问题。服务端必须校验 `subjectKey` 与当前身份一致，客户端不得传入该字段。

### 11.2 `TypingLibraryProgress`

- `subjectKey`、`userId`、`learnerId`、`libraryId`。
- `lastUnitId`、`lastItemId`、`lastSessionId`。
- `newItemCount`、`learnedItemCount`、`masteredItemCount`。
- `lastPracticedAt`、`createdAt`、`updatedAt`。

唯一键：`subjectKey + libraryId`。

### 11.3 `TypingPracticeSession`

- `id`、`subjectKey`、`userId`、`learnerId`。
- `libraryId`、可选 `unitId`。
- `mode`：第一版固定 `DICTATION`。
- `scope`：`UNIT`、`NEW`、`DUE_REVIEW`、`MIXED`。
- `status`：`ACTIVE`、`PAUSED`、`COMPLETED`、`ABANDONED`、`EXPIRED`。
- `targetItemCount`、`currentIndex`、`correctCount`、`wrongCount`、`hintedCount`。
- `activeSeconds`、`clientSessionKey`。
- `startedAt`、`lastActiveAt`、`completedAt`、`createdAt`、`updatedAt`。

同一身份最多存在一个可恢复的 `ACTIVE/PAUSED` 会话。新建会话前必须显式继续或结束旧会话。

### 11.4 `TypingPracticeSessionItem`

创建会话时固化题目顺序和内容版本：

- `sessionId`、`itemId`、`itemVersion`。
- `source`：`NEW`、`DUE_REVIEW`、`RELEARNING`。
- `queueOrder`、`repeatOfSessionItemId`。
- `answerSnapshot`：仅服务端返回校验服务使用，不随“下一题”接口下发。
- `status`：`PENDING`、`ACTIVE`、`CORRECT`、`SKIPPED`。
- `firstShownAt`、`completedAt`。

### 11.5 `TypingAttempt`

- `id`、`sessionId`、`sessionItemId`、`itemId`、`itemVersion`。
- `clientAttemptId`：客户端幂等键，唯一。
- `attemptNumber`。
- `isCorrect`、`errorTypes`、`errorPositions`。
- `durationMs`、`hintLevel`、`audioReplayCount`。
- `isReview`、`createdAt`。

`errorPositions` 只保存 token 下标、字符下标和错误类型，不保存完整输入正文。通用 `LearnerActivityEvent.metrics` 也不得写入答案正文。

### 11.6 `TypingReviewState`

- `subjectKey`、`userId`、`learnerId`、`itemId`、`itemVersion`。
- `state`：`NEW`、`LEARNING`、`REVIEW`、`RELEARNING`、`MASTERED`、`SUSPENDED`。
- `stage`、`dueAt`、`lastReviewedAt`、`masteredAt`。
- `totalAttempts`、`totalCorrect`、`lapseCount`、`hintCount`、`correctStreak`。
- `algorithmVersion`。
- 预留 `difficulty`、`stability`，第一版不参与计算，供后续 FSRS 迁移使用。

唯一键：`subjectKey + itemId`。内容项版本变化时不得直接丢弃旧记录；服务端根据变更类型决定沿用、降级到学习阶段或建立新版本状态。

### 11.7 `TypingPreference`

- `subjectKey`、`userId`、`learnerId`。
- `accent`：`US` 或 `UK`。
- `autoPlayAudio`、`replayAfterCorrect`、`showImage`。
- `feedbackSoundEnabled`、`soundVolume`。
- `inputStyle`：第一版默认 `UNDERLINE`，可预留 `BOX`。
- `createdAt`、`updatedAt`。

第一版只提供与练习直接相关的少量设置，不实现主题、字体市场和自定义快捷键。

## 12. API 需求

所有接口使用现有统一响应格式，所有错误提示使用简体中文。

### 12.1 内容库接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/typing/libraries` | 查询已发布内容库及筛选项 |
| `GET` | `/api/typing/libraries/:id` | 内容库详情、单元和公开统计 |
| `GET` | `/api/typing/libraries/:id/progress` | 当前身份的内容库进度 |

匿名用户只能获取公开元数据，不能获取答案、token 文本、音频内部对象键或用户进度。

### 12.2 会话接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/typing/sessions` | 创建练习会话 |
| `GET` | `/api/typing/sessions/active` | 查询可恢复会话 |
| `GET` | `/api/typing/sessions/:id` | 查询会话状态和当前题 |
| `POST` | `/api/typing/sessions/:id/attempts` | 提交一次答案 |
| `POST` | `/api/typing/sessions/:id/hints` | 获取下一级提示 |
| `POST` | `/api/typing/sessions/:id/pause` | 暂停会话 |
| `POST` | `/api/typing/sessions/:id/resume` | 恢复会话 |
| `POST` | `/api/typing/sessions/:id/finish` | 完成或主动结束会话 |

“当前题”响应在答对前只返回：

- 内容项 ID 和版本。
- 中文题面。
- 图片公开 URL。
- 当前口音的整题音频公开 URL。
- 可输入 token 的数量和每个 token 的字符数。
- 固定标点的位置。

不得提前返回标准英文、token 英文文本、音标或完整可接受答案。答对后响应才返回完整讲解数据。

错误响应示例：

```json
{
  "code": 0,
  "message": "答案中有 1 处需要修改",
  "data": {
    "correct": false,
    "result": [
      { "tokenIndex": 0, "status": "CORRECT", "charErrors": [] },
      { "tokenIndex": 1, "status": "SPELLING_ERROR", "charErrors": [2] }
    ],
    "nextHintLevel": 1
  }
}
```

提交接口必须由服务端重新完成规范化、答案比较、错误记录和复习调度，不能信任客户端传入的 `isCorrect`、阶段或 `dueAt`。

### 12.3 复习与统计接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/typing/reviews/summary` | 今日、明日、已掌握统计 |
| `GET` | `/api/typing/reviews` | 分页查询复习状态，可按内容库筛选 |
| `POST` | `/api/typing/reviews/sessions` | 从到期内容创建复习会话 |
| `POST` | `/api/typing/reviews/:itemId/reset` | 二次确认后重置单项状态 |
| `GET` | `/api/typing/history` | 练习历史和基础趋势 |
| `GET` / `PUT` | `/api/typing/preferences` | 查询和保存偏好 |

## 13. 与现有平台能力的集成

### 13.1 场景注册

新增内置 `AiScenario`：

- `name = "打字记词"`
- `slug = "typing"`
- `costCredits = 0`
- `requiredCapabilities = []`
- 不绑定默认 AI 模型。

同步补充：

- Web 的场景路径映射：`typing → /typing`。
- API 的学习者应用目录：`typing → /typing`。
- 场景授权列表和学习者首页卡片。

删除或禁用场景时不得级联删除内容库、练习记录和复习状态。

### 13.2 学习过程记录

专用 `Typing*` 表是答题和复习事实来源。现有学习过程体系只接收低敏感汇总事件：

- `LEARNING_STARTED`
- `PRACTICE_SUBMITTED`
- `REVIEW_COMPLETED`
- `LEARNING_COMPLETED`

事件使用 `scenarioId`、`resourceType = "TYPING_LIBRARY"`、`resourceId = libraryId`、`itemKey = itemId`，`metrics` 只包含是否正确、错误类型计数、提示级别、耗时和阶段变化。

现有学习上下文服务需要增加经过授权的“场景资源学习”分支，使 `typing` 在不伪装成 `Course` 或现有三类课件的情况下计入有效学习时长。不得为省事把英文内容库写入 `LEARNING_FLASHCARD` 类型。

## 14. 会话恢复、弱网和并发

- 每次答案提交成功后立即保存当前题号、统计和复习状态。
- 创建会话和提交答案都使用幂等键。
- 同一身份在两个标签页打开同一会话时，后打开的页面进入只读提示，用户确认后才能接管。
- 客户端通过 `BroadcastChannel` 辅助识别同身份多标签页，服务端仍执行最终版本校验。
- 弱网时允许保留当前输入，但答案未经服务端确认前不进入下一题。
- 音频和图片加载失败不影响文字答题。
- 内容项在会话中途发布新版本时，当前会话继续使用已固化版本；新会话使用新版本。

## 15. 安全、隐私和可访问性

### 15.1 安全

- 所有写接口要求登录并校验当前身份和场景授权。
- 会话、练习记录和复习状态必须校验 `subjectKey` 归属。
- 初始题目响应不得提前下发答案正文。
- 音频和图片只返回可公开访问或短时签名 URL，不返回对象存储内部路径。
- 参数错误、内容不存在、会话过期等错误均返回中文友好提示。
- 管理员尚未发布的内容不得通过 ID 猜测访问。

### 15.2 隐私

- 不在通用学习事件中记录完整输入答案。
- 未提交输入只保存在当前浏览器会话，退出后可清除。
- 长期记录错误位置和类型，不默认记录完整错误文本。
- 练习数据遵守账号和学习者的数据隔离规则。

### 15.3 可访问性

- 所有图标按钮有中文 `aria-label` 和可见/可聚焦 tooltip。
- 图片有替代文本；装饰图使用空替代文本。
- 不只依赖颜色表达正误，同时提供文字和图标。
- 键盘焦点清晰，Tab 保留给标准焦点导航，不被提示快捷键占用。
- 支持 `prefers-reduced-motion`，错误反馈不使用剧烈抖动。
- 移动端按自然顺序展示题面、图片、输入和操作区，输入槽位允许换行。

## 16. 性能与观测

- 内容库列表接口目标 P95 小于 500ms。
- 当前题和答案提交接口目标 P95 小于 300ms，不含媒体下载时间。
- 练习页预取下一题的非答案元数据和媒体，不能预取并暴露答案。
- 图片使用响应式尺寸，音频通过可缓存媒体 URL 播放。
- 记录会话创建失败、答案提交失败、重复幂等请求、媒体加载失败和复习调度异常。
- 不把用户答案正文写入应用日志。

## 17. 验收标准

### 17.1 内容库与入口

- `TYP-001`：访问 `/typing` 能看到已发布英文内容库，筛选条件来自 API。
- `TYP-002`：可按小学、译林版、五年级、上册筛选到对应测试内容库。
- `TYP-003`：匿名用户可以浏览内容库，但开始练习时被引导登录并能返回原页面。
- `TYP-004`：未获授权的学习者不能进入 `/typing` 练习。
- `TYP-005`：内容库详情按单元显示题量、新内容、待复习和进度。

### 17.2 练习

- `TYP-010`：开始练习后进入 `/typing/practice/[sessionId]`，题目进入时自动播放音频。
- `TYP-011`：有图片时显示中文、图片和按词拆分的横线；无图片时布局自然收拢。
- `TYP-012`：输入正确后再次播放读音，并显示英文、音标、词性和中文释义。
- `TYP-013`：答对讲解状态按 Enter 进入下一题。
- `TYP-014`：错误答案标出错误 token 和字符位置，并把焦点移到第一处错误。
- `TYP-015`：大小写、拼写、标点和空格错误能被区分。
- `TYP-016`：提示按钮与 `Ctrl/⌘ + /` 行为一致，三级提示逐步揭示信息。
- `TYP-017`：重复提交相同 `clientAttemptId` 不重复计错或重复调整复习时间。
- `TYP-018`：刷新或退出后可恢复到最后一个已确认题目。

### 17.3 复习

- `TYP-020`：首次答错或使用提示后，该内容进入复习状态。
- `TYP-021`：同一题连续输错只增加一次本题 `lapse`，但保留每次尝试事实。
- `TYP-022`：阶段 0 内容在至少间隔 3 题后于本轮再次出现。
- `TYP-023`：答对、答错和使用提示分别按照第 9 节规则更新阶段和 `dueAt`。
- `TYP-024`：复习页正确显示今日到期、明日待复习和已掌握数量。
- `TYP-025`：主账号与不同学习者的错词和复习计划互相隔离。

### 17.4 内容版本与隐私

- `TYP-030`：内容发布新版本后，已开始会话继续使用旧版本，新会话使用新版本。
- `TYP-031`：当前题接口在答对前不返回完整标准英文或音标。
- `TYP-032`：数据库通用学习事件和服务日志中不存在完整输入答案。
- `TYP-033`：归档内容库不能创建新会话，但历史记录仍可查看。

## 18. 实施边界

### 18.1 允许修改的目录

未来实现任务允许修改：

```text
apps/web/src/app/typing/
apps/web/src/components/typing/
apps/web/src/lib/typing-api.ts
apps/web/src/lib/profile-routing.ts
apps/web/tests/

apps/api-core/src/typing/
apps/api-core/src/profiles/learner-access.service.ts
apps/api-core/src/learner-learning/
apps/api-core/tests/

packages/database/prisma/schema.prisma
packages/database/prisma/migrations/
packages/database/prisma/seed.ts（或现有实际 seed 入口）
```

如需修改其他文件，实施任务必须先说明原因。

### 18.2 不允许修改的目录和模块

```text
apps/ai-gateway/
apps/api-core/src/payment/
apps/api-core/src/wallet/
CMS 文章、单页和分类模块
现有视频、图片、语音生成核心流程
```

### 18.3 数据库和 Seed

- 实现需要新增 Prisma migration。
- Seed 只注册内置 `typing` 场景和一个最小开发测试内容库。
- Seed 不得录入或分发未经确认的完整商业教材内容。
- 内容库后台、真实教材导入和生产数据发布另开任务。

## 19. 建议实施批次

### 批次 A：内容契约与最小可见入口

- 新增 `EnglishContent*` 与 `Typing*` 数据模型。
- 注册 `typing` 场景和路径授权。
- 加入最小开发测试内容库。
- 完成 `/typing` 内容库列表和详情页。

验收页面：`/typing`、`/typing/libraries/[libraryId]`。

### 批次 B：练习闭环

- 创建、恢复和结束会话。
- 沉浸式练习页。
- 音频、图片、横线输入、服务端校验和正确讲解。
- 分级提示和快捷键。

验收页面：`/typing/practice/[sessionId]`。

### 批次 C：记忆曲线与复习

- `TypingReviewState` 调度。
- 本轮重现、到期复习、复习页和历史统计。
- 与学习事件和有效学习时长对接。

验收页面：`/typing/review`、`/typing/history`。

每一批都必须独立可见、可验证，不得在批次 A 顺手建设真实教材导入后台或其他练习模式。

## 20. 未来实现验收命令

批次 A 涉及数据库和新路由，至少运行：

```bash
pnpm db:generate
pnpm --filter @xueleai/api-core test -- typing
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/web build
```

包含 migration 的本地验收还需在独立测试数据库执行项目现有迁移命令。具体 script 名称以实施时 `package.json` 为准，不得在生产数据库执行 reset。

批次 B、C 至少增加：

- 服务端答案规范化和差异定位单元测试。
- 幂等提交与身份隔离测试。
- 记忆阶段前进、后退、提示和跨日到期测试。
- Web 端练习状态机、快捷键和恢复行为测试。
- 浏览器验证桌面与移动端可见行为。

## 21. 后续独立任务

以下内容必须另开需求，不属于本次 `/typing` 应用开发：

1. 英文内容库管理后台。
2. 教材 PDF/Markdown 提取为结构化英文内容。
3. 词典自动补全音标、词性、释义和发音。
4. 内容审核、版权来源、发布与版本回滚流程。
5. 文章库的段落拆句和人工校对流程。
6. 口语、拼图、指法等新练习模式。
7. FSRS 参数训练或自适应难度模型。
