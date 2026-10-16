# 小小百科翻翻书发布与同步

本专辑为20册双语认知绘本，每册20个内页与1张封面。原图420张均为1600×1600、1:1、纯白背景；中文在上、物体居中、英文在下。无音频。专辑入口封面1920×1080，20张绘本馆目录封面1536×1152，保留完整方形封面并加白边，共441份图片素材。

选定文稿和420张原图摘要在 `scripts/picture-books/encyclopedia-series-data.json`，21张目录/专辑封面摘要在 `encyclopedia-cover-data.json`。素材实际文件保留在本地 `output/picture-books/little-encyclopedia`，不随代码发布。

## 执行边界

仅允许固定作者、审核管理员、local/production数据库实例、abei 3604端口和 r.abeiai.com。所有脚本必须在最新 `origin/main` 的已生成Prisma客户端和已编译API环境运行，包含 `publishedSnapshot` 和 `pinnedSnapshot` 字段。不修改schema、不迁移数据结构、不执行seed。

本地使用 `publish-encyclopedia-series.mjs --mode=prepare|publish|verify`，必须传 `--admin-id`、`--checkpoint`、`--root` 和指向原项目的 `--env-file`。准备和审批分别使用现有作品、课程、审核和投稿服务。断点文件放在权限0700的 `.superpowers/encyclopedia-release` 下，文件0600。

审核前后检查素材字节、完整文稿、当前与已批准快照、投稿公开快照和课程固定快照。最终批准前重新断言同一投稿行的ID、状态、内容哈希、完整快照、封面和操作token，再使用这一行的 `updatedAt` 批准。不能覆盖同名异ID、人工改稿、未知上传结果或非本次任务待审版本。

## 生产同步

先通过完整绘本脚本测试和真实包校验，再在独立 `abei_encyclopedia_sync_test` PostgreSQL实例（127.0.0.1:3607）测试故障回滚、完整导入、零写入重放和线上改稿保护。

发布脚本提交到GitHub main并通过 `git ls-remote origin refs/heads/main` 核对。服务器 `/opt/abei` 不是Git仓库；仅从该提交的 `git archive` 传输本次脚本及依赖。此任务只发布内容和执行辅助脚本，不重建或更换应用服务。

`encyclopedia-production-sync-runner.mjs --mode=export` 导出审批包，指定 `--checkpoint`、`--admin-id`、`--file`、`--env-file`。包只能经SSH私传到 `/opt/abei/deploy/data/encyclopedia-sync/`，目录0700、文件0600。传输前后必须核对SHA-256。`inspect/apply/verify`均必须传同一 `--sha256`。

同步限定10张表，共441个图片资产、20本绘本、20份投稿、20份课件、1个专辑、1个版本、20个目录项、1次课程审核、21条原审核日志。首次同步额外增加1条同步审计日志。先保存目标备份，再校验全部R2字节。写入使用SERIALIZABLE事务、任务锁和身份行锁；只允许INSERT或逐字段相同REUSE。校验表计数、范围外记录摘要、作者和钱包未变化。

最后核对公开专辑、20个绘本播放接口、全部图片字节与尺寸，并检查 new.abeiai.com 的 `/api/health`、`/api/health/db`、`/api/health/redis`、`/api/system-config/public` 以及浏览器中的专辑封面和实际书页。
