# 旧版增量导入

本方案用于将旧版新增用户、生成记录及相关素材同步到**本地 abei**。旧 MySQL 只读，旧素材只 GET/HEAD；素材复制到已有公开 `abeiai` R2。全量历史素材任务保持暂停，不能将全量父包传给本方案的上传步骤。

## 增量边界

- 起点是上次**已应用数据库快照**的开始时间，不是素材上传结束时间。
- 每表保存主键高水位，在同一个 READ ONLY / REPEATABLE READ 快照中固定上界；读取新主键，以及起点前 10 分钟以来的请求、响应、创建、更新时间。空增量仍保留原水位。
- 用户、普通会话及模型版本完整读取以确认依赖。新增用户通过认证的累计源用户 ID 集合差集识别，避免低于水位的晚提交用户漏采；依赖读取不会触发旧头像和历史素材重传。
- 生成记录刷新以来源和快照时间为条件，旧批次重放不能回退新状态。旧会话追加消息继承位置；多轮语音可复用身份、归属、版本和正文一致的历史分段。
- 既有密码、微信身份、用户状态和已编辑绘本保持不覆盖。新兼容绘本导入；通用作品及财务实体保留加密原始档案，不产生钱包余额、订单履约或管理员权限。
- 绘本封面及内页的画面提示词从同一用户的成功绘图记录、作品编辑器快照或明确关联的一键生成任务还原；素材阶段仅补空字段，保留已恢复提示词及已存在的图片、音频。
- 每批是独立加密增量包，不能代替全量备份。密钥放在包外；控制台仅输出数量及运行状态。

存量画面提示词的来源、事务保护及本地和线上修复记录见 [旧版绘本画面生成提示词补齐](ops/legacy-book-prompt-repair.md)。

## 重复执行步骤

以下命令在本项目根目录执行。使用 Python 3.12 虚拟环境及 `tools/legacy_sync/requirements.txt` 固定依赖。实际配置文件均留在本地忽略目录，不提交 Git、不在聊天或日志中打印密钥。

约定 `PYTHON` 为虚拟环境解释器，`CURSOR` 为本地已应用游标，`BATCH` 为新的包目录，`KEY` 为包外的独立 32 字节密钥文件，`RUN_ID` 为唯一批次名。`SOURCE_BASE`/`SOURCE_DEV` 是旧配置（后者覆盖前者），`TARGET` 是本地 PostgreSQL 配置，`MP_PROOF` 是已核验公众号身份描述，`ORIGIN` 是旧对象配置，`R2` 是新桶配置。

首次初始化只执行一次。父包必须有完成的原生导入收据、所选素材范围收据及对应对账，已有缺失素材会进入独立待补清单：

```bash
"$PYTHON" -m tools.legacy_sync.incremental_state \
  --initialize --package "$BASELINE" --key-file "$BASELINE_KEY" \
  --cursor-file "$CURSOR" \
  --baseline-missing-report "reports/selection-$BASELINE_SELECTION.enc"
```

1. 生成独立密钥和空批次目录，按游标只读采集。连接端口、来源、架构、父包和时间必须一致，断连后整包失效，应重新采集。旧 V1 父包缺少端点指纹时，首次绑定才使用 `--bind-legacy-endpoint`；本项目当前父包已绑定。

独立密钥使用独占创建，已有批次不能覆盖：

```bash
"$PYTHON" - "$KEY" <<'PY_KEY'
import os, secrets, sys
from pathlib import Path
path = Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as out:
    out.write(secrets.token_bytes(32))
PY_KEY
"$PYTHON" -m tools.legacy_sync.incremental \
  --source-env "$SOURCE_BASE" --source-env "$SOURCE_DEV" \
  --cursor-file "$CURSOR" --output "$BATCH" --key-file "$KEY" \
  --run-id "$RUN_ID" --confirmed-legacy-entry
```

2. 先预检再应用核心数据；该进程只加载本地库配置，不加载旧 MySQL 凭据。

```bash
"$PYTHON" -m tools.legacy_sync.native_import \
  --package "$BATCH" --key-file "$KEY" --target-env "$TARGET" \
  --verified-mp-identity-file "$MP_PROOF" --phase core --dry-run
"$PYTHON" -m tools.legacy_sync.native_import \
  --package "$BATCH" --key-file "$KEY" --target-env "$TARGET" \
  --verified-mp-identity-file "$MP_PROOF" --phase core --allow-pending-assets
```

3. 仅扫描和复制当前增量包素材，不传历史 `--selection`。成功对象按内容摘要复用，条件创建并核验摘要与长度；失败对象最多自动重试一次。当前上传器退出后再进行下一步。

```bash
"$PYTHON" -m tools.legacy_sync.asset_index \
  --package "$BATCH" --key-file "$KEY" \
  --source-storage-env "$ORIGIN" --r2-env "$R2" --workers 16
"$PYTHON" -m tools.legacy_sync.asset_index \
  --package "$BATCH" --key-file "$KEY" \
  --source-storage-env "$ORIGIN" --r2-env "$R2" --workers 16 --retry-failed
```

4. 回填素材，再导入独立语音历史。`BASELINE` / `BASELINE_KEY` 必须指向已验证的原始全量包，用来排除早期绘本使用的音频，不能改成上一份增量包。该步骤只读取旧快照及本地已验证的 R2 关联，不访问旧数据库，不发起上传、生成或扣费。

```bash
"$PYTHON" -m tools.legacy_sync.native_import \
  --package "$BATCH" --key-file "$KEY" --target-env "$TARGET" \
  --verified-mp-identity-file "$MP_PROOF" --phase assets
"$PYTHON" -m tools.legacy_sync.voice_history_import \
  --package "$BATCH" --key-file "$KEY" --target-env "$TARGET" \
  --r2-public-env "$R2" \
  --book-reference-package "$BASELINE" --book-reference-key-file "$BASELINE_KEY"
"$PYTHON" -m tools.legacy_sync.voice_history_import \
  --package "$BATCH" --key-file "$KEY" --target-env "$TARGET" \
  --r2-public-env "$R2" \
  --book-reference-package "$BASELINE" --book-reference-key-file "$BASELINE_KEY" --apply
```

5. 对账逐条检查生成正文、时间、归属、素材关联及摘要，验证新兼容绘本，按媒体类型抽样公开 R2 回读。独立语音步骤成功后再执行对账及游标推进；成功写认证收据，并以父批次/端点/截止时间 CAS 原子推进游标。出现 PENDING、映射错误或回读失败时游标不推进。

```bash
"$PYTHON" -m tools.legacy_sync.incremental_state \
  --package "$BATCH" --key-file "$KEY" --cursor-file "$CURSOR" \
  --target-env "$TARGET" --r2-public-env "$R2"
```

每次只运行一个管线。当前本地管线使用文件锁，子进程继承锁；收到停止信号会停止整个子进程组，避免残留上传器。中断后重放同一包可恢复，成功对象不会重复上传、原生 ID 不会重复插入；游标已经推进时同一批次可再次核验。过期或分叉父包应拒绝，不手工修改游标。

## 完成状态与缺口

`reports/incremental-reconciliation.enc` 保存本批计数、素材成功/缺失、公开回读及目标统计。`increment-cursor.json` 保存最新已应用包、包外密钥路径、来源端点和快照时间，同时保留所有历史缺失批次。

MISSING 表示本批已尝试但仍需补档，可以在原生数据对账通过后推进数据游标；不代表全部素材成功。素材补档继续使用原批次索引和密钥，不能靠推进数据库游标遗忘失败项。公开回读仅证明抽样文件字节一致，不保证所有媒体浏览器播放兼容。

后台验收：`http://localhost:3600/admin/users`、`http://localhost:3600/admin/ai-logs?source=LEGACY`；独立语音在 `/voice` 验收。导入不修改数据库 schema 或 seed，`/voice` 仅增加旧版费用和缺失素材提示。

## 独立语音历史规则

`tools/legacy_sync/voice_history_import.py` 将有已迁移归属的 `app_ai_ttsmessage` 映射到原生 `AudioTask` / `AudioAsset`，在 `/voice` 的单人配音历史中按原始生成时间展示。任务 ID 由来源表及主键固定生成，重复执行不会新增重复记录；只允许刷新相同来源、归属、正文、创建时间且未产生账务的历史任务，较旧快照不能覆盖较新状态。

- 排除 `one_take_id`、`book_id`、`case_id`、`page_id`、`case_page_id` 等来源标记，包括嵌套标记；排除绘本应用、非音频应用，以及已被原始绘本或 CMS 绘本引用的语音。
- 配置目录中的 `draw_style.book` 是示例图片，不作为绘本生成来源。未知 metadata 类型、未知配置字段及标记为敏感的正文继续留在加密档案，不能默认导入。
- 只关联同一用户、`OUTPUT`、`/assistant_content`、`AVAILABLE` 的 R2 音频，核对域名、完整对象路径、摘要、MIME 和长度。多个历史记录可复用同一用户已上传的文件，不重传。
- 历史任务均为终态，成功但缺失 R2 文件的记录显示“旧版音频尚未同步到 R2。”；不会进入新生成队列。费用无法还原时前台显示“旧版记录”，不伪装成历史零费用，不写订单、余额、流水、预扣或用量。
- 事务先核验旧日志归属、正文、时间及已有资产冲突，再插入。来源不匹配时整批回滚。`reports/voice-history-import.enc` 保存认证收据；不需要 schema migration 或 seed。

全量历史素材上传继续暂停，保留最近 30 日有访问素材的既定范围。新增独立语音素材随未来增量批次上传及回填；历史缺失音频补传须另建明确范围。

### 2026-10-10 语音历史回填

使用已验证的全量及 2026-10-09 增量快照，截止北京时间 **2026-10-09 20:33:23**，本地及 `new.abeiai.com` 均已导入：

| 内容 | 结果 |
| --- | ---: |
| 独立语音历史 | 66,366 条 |
| 已有 R2 音频可播放 | 29,377 条 |
| 成功但未同步音频 | 34,907 条 |
| 旧版合成失败 | 2,082 条 |
| 复用音频文件 | 738 个，按用户及对象去重 |
| 重复应用 | 0 新增、0 更新 |

原有 19 条语音任务、201 个语音资产逐字段保持一致。用户、钱包、流水、预扣、语音用量、订单、管理员、AI 任务和绘本的全表摘要前后相同。未连接旧数据库，没有新增生成或扣费，也没有恢复全量上传。来源敏感正文共 70 条继续留在加密档案；其中 63 条属于其他条件合格的独立语音，已排除。

真实线上 `AudioService` 验证 5 条详情及 5 次历史列表，跨用户读取全部拒绝；4 个 MP3/WAV 音频共 2,013,498 字节公开回读，长度及 SHA-256 一致。尾号 0900 用户有 30,605 条独立历史，其中 29,347 条可播放。迁移测试 84 项、前端测试 598 项、前端类型检查及独立复核通过。

本次私有计划、前像备份和核验证据由 `.superpowers/legacy-sync/voice-history-run.json` 指向；密钥留在包外。`finish-increment-pipeline.py` 已在对账及推进游标之前加入独立语音预检和应用。当前 104 条增量语音均有绘本生成标记，独立语音新增为 0；认证收据已写入该增量包。

页面提示以 `49957a2` 发布到 GitHub `main`，服务器仅部署新版 Web 镜像，保留环境、数据和其他服务。生产构建通过，4 个健康/配置接口及 `/voice` 均返回 200；已检查运行镜像包含旧版费用及缺失音频提示。`--reconcile-only` 不重跑语音写入，要求当前包已有匹配的认证语音收据；应用或补填使用正常流程或 `--finalize-only`。

## 后续开发要求

1. 通用旧作品（`app_ai_works`）需要原生档案结构和查询入口；模板、多结果批次、作品分组、公开状态及修订关系不能直接塞入 PictureBook。
2. 无通用修改时间的表只能保证新增主键。硬删除、未更新时间的原地修改以及晚提交且超出 10 分钟窗口的旧主键更新，需要 CDC 或定期全量核对。已有用户资料变更另需字段冲突合并规则。
3. 旧绘本正文的后续修订、企业/开放平台/助手的间接素材归属需要明确关系映射及冲突处理。
4. 订单、流水、余额和会员权益需要独立的类型、单位、状态和履约规则；当前仅留档。
5. 缺失或失效的旧素材需补源；AAC/M4A、Ogg 视频等后台播放兼容按已有迁移缺口继续处理。

## 2026-10-09 实测结果

批次 `legacy-delta-20261009T123322Z-0eb94d9e`，截止 **北京时间 2026-10-09 20:33:23**，已应用并推进游标。

| 内容 | 本批新增 / 结果 |
| --- | ---: |
| 用户 | 17 |
| 普通对话会话 | 32 |
| 对话日志 | 29 |
| 图片日志 | 124 |
| 语音日志 | 104 |
| 视频日志 | 0 |
| 产品 | 17：13 本兼容绘本导入，4 条不兼容留档 |
| 通用作品 | 47：原始记录及对应素材留档，需补原生结构 |
| 范围内素材 | 478 个源对象，5,890 处引用 |
| R2 完成 | 478 AVAILABLE，0 MISSING，0 PENDING |
| 核验文件总量 | 232,122,167 字节（按源对象计，内容相同可复用 R2 对象） |
| 日志素材关联 | 1,896 AVAILABLE，对账完全一致 |

图片、语音和视频各抽样公开回读，长度和 SHA-256 一致。本地当前用户 36,549、旧版日志 4,048,418、绘本 42,928；后台旧版日志页显示 4,048,418 条且可见本批记录。钱包、流水、订单、管理员和任务总数与本批前一致，未激活旧财务/权限。核心数据重复应用计数一致。63 项迁移测试（包含真实隔离 PostgreSQL）、独立代码复审及最终认证对账通过。

游标继续保留上批 **52** 个缺失对象；历史全量素材上传保持暂停。初次索引发现旧广场更新时间带入大量历史引用，已停传并封存 `assets/index-pre-scope-fix.sqlite`，以范围版本重新建索引。原检查点有 856 个认证成功对象，其中 474 个仍属于当前范围并复用；其余 382 个未挂接到本地，不删除可能已经共享的 R2 对象。后续增量已从规则上排除广场和财务表素材。

本地运行文件已保存到 `/Users/ericword/abei/.superpowers/legacy-sync/`（Git 忽略，配置文件权限 0600）：

- 解释器：`asset-venv/bin/python`。
- 已应用游标：`increment-cursor.json`；本批路径：`increment-run.json`。
- 目标 / 公众号证明：`target-only.env`、`source-mp-namespace.json`。
- 旧对象 / R2：`source-storage.env`、`r2-only.env`。
- 本批重放管线：`finish-increment-pipeline.py`；只重新核验使用 `--reconcile-only`，重新回填并核验使用 `--finalize-only`。重放不会采集新的旧库数据。

下一批使用以上游标和配置，另建包、密钥及唯一 RUN_ID，执行前述采集到对账步骤；如使用本地管线应用新包，先将 `increment-run.json` 指向已验证的新包及包外密钥。不要把该文件指回全量父包。密钥实际保存在 `/Users/ericword/.local/share/abei-legacy-migration/keys/`，不与包共同分发。

## 2026-10-10 既有绘本素材链接修复

迁移前应核查存量绘本的媒体字段：R2 对象为 AVAILABLE，不代表绘本 `pages.imageUrl` / `pages.audioUrl` 已回填。旧 MySQL 时间保留微秒，目标 PostgreSQL 为 `TIMESTAMP(3)`；按原始微秒时间比较会漏掉回填。增量导入已将比较统一为 UTC 的毫秒时间，但这不会自动补跑全量父包中的既有绘本。

`tools/legacy_sync/book_asset_repair.py` 提供离线修复计划和事务 SQL：

1. 使用认证的原始快照和对应加密素材索引，逐条核验 sourcePk、用户归属、对象状态、长度、SHA-256 和批准的 R2 公共地址。只处理指定用户及指定绘本，无须连接旧库或重新上传素材。
2. 修复前读取并加密备份目标绘本。计划要求归属、`version=0`、UTC 毫秒更新时间、页数、页位置及所有非媒体页字段与源一致；只填空的图片和语音地址，保留已有素材和正文。检测到后续编辑时中止，不覆盖用户内容。
3. 对明确的 `abei` 数据库执行单一事务；使用与导入器相同的事务锁，整批比较备份、版本、归属、时间和页面快照，发现冲突全部回滚。只修改页面媒体字段和符合完整条件的绘本状态，不修改版本、更新时间、财务、账号或任务。
4. 提交后逐本核验，并用相同计划重复执行确认零修改。通过线上应用的绘本、图片、语音读取逻辑及 R2 回读验证实际可用性。修复历史链接不推进增量采集游标。

本次仅定向修复尾号 **0900** 的账号，已同时应用本地及 `new.abeiai.com` 的 `abei-prod` 数据库：

| 内容 | 修复结果 |
| --- | ---: |
| 绘本 / 页面 | 51 本 / 457 页 |
| 图片链接 | 439 页 |
| 语音链接 | 418 页 |
| 《云朵工厂》 | 17 页图片、17 页语音 |
| 重放修改 | 0 本、0 条链接 |
| 原始记录无素材 | 18 页无图片、39 页无语音 |

《云朵工厂》的图片、语音全部公开回读核验字节长度和 SHA-256；17 页图片复用 16 个不同图片对象。该缺口统计已对照原始页面字段，区别于上传失败。修复没有触发生成或扣费，前后钱包、流水、订单、管理员和 AI 任务计数一致。66 项迁移测试（包含隔离 PostgreSQL 的事务、重放、正文冲突回滚）、独立代码审查通过；没有修改 schema、seed 或前后端页面，不需要构建、重启或部署应用。

本次私有运行信息在 `.superpowers/legacy-sync/book-repair-run.json`；其目录内 `reports/before-production.enc` 为线上前像备份，`reports/verification.enc`、`reports/media-verification.enc` 及 `reports/source-gaps.enc` 为核验证据。包外密钥保存在既有本地密钥目录，不提交 Git。原始图片、语音地址及作品正文仅进入加密文件，公开文档不记录完整手机号。后续账号必须重新生成并核验独立计划，不能直接扩大本次 SQL 的目标范围，也不能用整库覆盖替代定向修复。

## 旧绘本风格

新增绘本导入时使用[旧版绘本风格映射](legacy-picture-book-style-mapping.md)，优先保留能恢复的旧画风；未保存、历史记录无法关联或新版没有对应画风时，使用新版平面插画。存量绘本采用独立的风格补填事务，不重跑素材回填或推进数据游标。

## 2026-10-10 旧绘本 5:4 / 4:5 比例修复

原导入将所有绘本比例固定为 `1:1`。旧绘图选择编码 `3` 对应 `5:4`，`5` 对应 `4:5`；绘本结果的 `book_ratio` 是比例或图片尺寸，不能把数值字符串当成绘图选择编码。旧“一步绘本”结果曾固定写 `9:16`，因此应优先使用与原任务归属、封面和 draw ID 匹配的绘图日志中的真实 `aspect_ratio`。

`tools/legacy_sync/book_ratios.py` 已接入核心导入、素材回填及增量映射。直接保存的比例、`extra.draw.aspect_ratio`、匹配的封面绘图记录会对应新版已有选项；旧 CMS 像素尺寸仅允许 0.3% 的舍入误差。未知比例保持默认值，不将 `21:9` 偷换成新版 `21:10`；`21:9` / `9:21` 若需原样编辑，应后续扩充新版选项。

本次存量仅定向修复来源明确为 `5:4` / `4:5`、当前为导入默认 `1:1`、`version=0` 且更新时间仍等于源快照的绘本。已选择其他比例或后续编辑的绘本保留设置。

| 内容 | 本地 | new.abeiai.com |
| --- | ---: | ---: |
| 绘本比例修复 | 71 本 | 71 本 |
| 5:4 | 61 本 | 61 本 |
| 4:5 | 10 本 | 10 本 |
| 课程已发布快照同步 | 0 | 19 份 |
| 绘本 / 发布快照重放修改 | 0 / 0 | 0 / 0 |

`book_ratio_repair.py` 对原生绘本和发布快照采用同一事务。每本核验归属、创建时间、版本、更新时间及除比例外的整行摘要，只修改 `aspectRatio`。19 份课程发布快照原先均与对应原作品完全相同、已批准且没有待审修改；仅修正快照顶层比例，按正式 `hashCourseSnapshot` 算法重新计算 current/approved 摘要，保留正文、图片/语音、发布状态、时间及历史审核记录。Python 与实际 TypeScript 哈希逐份一致。

事务锁定发布、审核和投稿表后核验完整关联清单，出现计划外发布副本、投稿、待审请求或快照漂移时整批回滚；锁等待最多 5 秒。财务、用户、音频任务/素材、审核记录及其他发布副本的全表摘要保持一致；所有绘本的非比例字段一致。没有连接旧库、重新生成、重新上传、扣费、修改 schema 或 seed，也无需部署或重启服务。

92 项迁移测试（包含真实隔离 PostgreSQL 的事务/冲突/重放）、独立审查通过；线上真实播放服务核验 71 本本人绘本及 19 本已发布资源，正式快照摘要全部一致。《奉和令公绿野堂种花》本人及课程播放均返回 `5:4`。已有增量批次重新对账通过，未推进到新的源快照；旧批次其余已导入比例保持本次范围外的设置。

本次加密计划、前像、来源及核验证据由 `.superpowers/legacy-sync/ratio-repair-run.json` 指向，密钥仍位于包外；旧全量素材上传继续暂停。
