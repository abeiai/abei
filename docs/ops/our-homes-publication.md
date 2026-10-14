# 《我们的家》发布与同步

范围为12册，每册封面加16跨页，共204张原作；另有12张平台绘本馆缩略图和1张系列入口封面，共217份图片，未生成配音。单册封面4:5、内页8:5，文字嵌图。定稿文案、页序、选稿路径及SHA-256固定在 `scripts/picture-books/our-homes-series-data.json`。

本地作者沿用乐乐绘本工作室。使用当前线上版本的业务服务执行保存、课程提交审核、课程批准、逐本投稿批准并记录管理员日志。原作图片保持原始字节，目录封面通过平台标准适配。用户/钱包不复制，已有不同内容、未绑定本任务的待审以及拒审记录均停止处理。

## 本地发布

先构建当前代码的database和api-core。环境文件仅在运行时读取，不提交。脚本核验本地数据库系统标识、3604端口和指定作者/管理员身份。

```bash
node scripts/picture-books/publish-our-homes-series.mjs --mode=publish --admin-id=cmupmv9tf000196lgbh9s8wf0 --env-file=/private/path/.env --root=/private/path/our-homes-v1 --checkpoint=/private/path/local-checkpoint.json
```

素材先登记UPLOADING断点，上传后回读R2并校验SHA-256才置READY。结果不明时不能重复上传；核对具体资产ID和远端字节后，通过 `--reconcile-key` 和 `--reconcile-id` 恢复。重跑复用相同资产。

## 私有同步

```bash
node scripts/picture-books/our-homes-production-sync-runner.mjs --mode=export --env-file=/private/path/.env --admin-id=cmupmv9tf000196lgbh9s8wf0 --checkpoint=/private/path/local-checkpoint.json --file=/private/path/approved-bundle.json
```

同步包目录权限700、文件600。源码通过GitHub main的已验证提交发布；同步包单独SSH传到 `/opt/abei/deploy/data/our-homes-sync/`，传输前后比较SHA-256。不同步真实环境配置、密钥、本地PDF或完整数据库。

生产在 `abei-prod-api-core-1` 的运行环境依次执行同一runner的 `--mode=inspect`、`--mode=apply`、`--mode=verify`，每次指定 `--file` 与 `--sha256`。必须核验数据库系统标识和 `https://new.abeiai.com`，R2固定 `https://r.abeiai.com`。

|表|同步包记录数|
|---|---:|
|media_assets|217|
|audio_assets|0|
|picture_books|12|
|picture_book_submissions|12|
|course_material_publications|12|
|courses|1|
|course_revisions|1|
|course_revision_items|12|
|course_review_requests|1|
|admin_operation_logs|13|

首次应用额外创建1条同步审计日志，总新增282行。只允许INSERT或逐字段一致的REUSE，事务内检查表计数、范围外数据摘要和作者/钱包摘要。已存在不完整同名系列不自动修复。新版本已发布快照、专辑固定快照、素材哈希及审核身份均必须对应同一定稿。

## 验证

- `node --test scripts/picture-books/our-homes-publication.test.mjs scripts/picture-books/our-homes-production-sync.test.mjs`
- 用 `OUR_HOMES_TEST_BUNDLE` 指定真实导出包，再跑上述包校验；用 `OUR_HOMES_SYNC_TEST_URL` 指定独立的 `127.0.0.1:3607/abei_our_homes_sync_test` 跑 `our-homes-production-sync.integration.test.mjs`，验证故障回滚、首次写入、零写入重放、人工修改保护。
- 生产校验217份R2字节、公开系列12项目和12册各17帧、4:5跨页模式、嵌图文字以及0音频。
- 复验 `/api/health`、`/api/health/db`、`/api/health/redis`、`/api/system-config/public`，并实际打开系列目录与绘本阅读页。

本次是内容发布，应用业务代码和schema无修改；无需migration、seed或重启线上应用。全量 `pnpm test` 的数据库用例需要专用测试配置，不能用生产环境补跑。
