# 徐霞客游记绘本版发布与同步

用户授权制作16:9专辑封面并发布本地、同步线上。专辑16册；每册16个正文单页及1张原封面，原作图片272张、逐页音频272段。图文保持5:4，isSpread=false，文字在图外。专辑封面1920×1080，目录封面16张1536×1152（完整保留原画，按既有目录规范补边），图片资产总计289份。

音频使用 Minimax speech-2.8-hd，音色 ttv-voice-2026082422142526-HkQ1ESKA、语速0.94。272份原音频经技术检查，专名读音听审仍为 PENDING_NOT_LISTENED；不得把发布审批或ASR等同于发音听审完成。15册13页保留优先听审记录。此发布不发起任何新的付费配音生成。

代码仅新增 scripts/picture-books/xuxiake-*、publish-xuxiake-series.mjs 和本说明，不改平台服务、schema或seed。使用当前main编译的数据库和API服务，复用媒体上传、音频上传、课程提交审批及绘本投稿审批。运行本地脚本指定 --env-file、--root、--checkpoint、--admin-id，私有断点目录0700、文件0600。网络使用系统既有代理时可用 node --use-env-proxy，NO_PROXY 保留127.0.0.1/localhost。

原图、音频和专辑封面按固定SHA-256选稿上传。UPLOADING结果不明时先按数据库归属和R2字节校验，禁止盲目重复上传。重复执行只复用相同素材与快照；拒审、无关待审、人工改稿必须停止。新提交的状态预条件插入现有服务的同一事务，使用相同业务锁；已有PENDING记录不重新提交，审批使用updatedAt比较。

本地 publish-xuxiake-series.mjs --mode=prepare/publish/verify。审批完成后 xuxiake-production-sync-runner.mjs --mode=export 导出私有包。包包括10个表的已批准行、561份素材清单与哈希；通过独立SSH私传，不提交GitHub或随代码发布。生产目标固定 new.abeiai.com、/opt/abei非Git发布目录、abei-prod容器；验证abei库3604和系统实例ID，禁止xueleai实例。

代码先提交推送main，并确认git ls-remote origin refs/heads/main，再只用该提交的git archive同步新增操作脚本；不重建应用、不替换.env.production或卷。私有包放 /opt/abei/deploy/data/xuxiake-sync，目录0700、文件0600，传输前后比较SHA-256。生产 inspect/apply/verify均要求 --sha256。使用同一编译API服务执行验证。

同步采用SERIALIZABLE事务、业务锁、实例与作者/管理员身份检查、现有目标行锁、字段精确匹配。只INSERT或逐字段相同REUSE，不覆盖线上行；已有不完整系列也停止。写入前保存目标快照；写入后比较逐表计数、范围外行摘要、作者及钱包摘要。完整同步新增289媒体、272音频、16作品、16投稿、16课件、1专辑、1版本、16目录项、1审核及18日志，共646行。完全重放应0行写入。

验证运行完整picture-books操作测试；使用独立PostgreSQL127.0.0.1:3607/abei_xuxiake_sync_test验证真实包失败回滚、完整导入、0写入重放和人工修改保护。最终复验本地和线上公开专辑、16本play接口、272页图文/配音引用、R2全部素材字节、真实浏览器播放，以及 /api/health、/api/health/db、/api/health/redis、/api/system-config/public。分别记录GitHub、数据同步、公开页面与健康接口结果。
