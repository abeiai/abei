# 《阿禾的四季》生产同步

本流程只同步已审核的四册《阿禾的四季》及系列课程，不复制整库，不触碰 xueleai 环境。代码发布遵循 [abei 生产发布](abei-production.md)：先推送本次提交到 GitHub `main` 并核对远端 SHA，再将同一提交的代码同步到 `/opt/abei`，使用 `docker-compose.abei-prod.yml` 和 `abei-prod`。

本地 `publish-seasons-series.mjs` 使用现有课程及绘本投稿服务完成 `submit` 和管理员 `approve`。私有导出包由 `seasons-production-sync-runner.mjs --mode=export` 生成，含 77 份素材的 R2 对象哈希、四册已批准快照、系列已批准快照和 5 条审核日志。导出包仅存于 `.superpowers/seasons-release/` 和服务器私有 `deploy/data/seasons-sync/`，不可提交到 GitHub。

线上依次运行 `--mode=inspect`、`--mode=apply`、`--mode=verify`，均须提供导出包 SHA-256。写入前严格核对生产数据库身份、作者和管理员、现有同名作品、每张素材的 R2 实际字节。写入为单个可回滚事务；只允许空目标或字节等价的已同步记录。运行时会保存目标写前快照；复核表计数、范围外数据、作者与钱包摘要，并重新验证 77 份素材哈希。

复验公开目录 `https://new.abeiai.com/c/44161c2a6c5443fb15110275`、绘本馆四本作品、每本 1 张封面及 8 个跨页、每页图片与配音，以及 `/api/health`、`/api/health/db`、`/api/health/redis`、`/api/system-config/public`。发布报告须分别给出 GitHub SHA、服务器 revision、四册 `APPROVED` 投稿数、系列公开状态、前后表计数和素材哈希结果。
