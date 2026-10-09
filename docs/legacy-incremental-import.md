# 旧版增量导入

本方案用于将旧版新增用户、生成记录及相关素材同步到**本地 abei**。旧 MySQL 只读，旧素材只 GET/HEAD；素材复制到已有公开 `abeiai` R2。全量历史素材任务保持暂停，不能将全量父包传给本方案的上传步骤。

## 增量边界

- 起点是上次**已应用数据库快照**的开始时间，不是素材上传结束时间。
- 每表保存主键高水位，在同一个 READ ONLY / REPEATABLE READ 快照中固定上界；读取新主键，以及起点前 10 分钟以来的请求、响应、创建、更新时间。空增量仍保留原水位。
- 用户、普通会话及模型版本完整读取以确认依赖。新增用户通过认证的累计源用户 ID 集合差集识别，避免低于水位的晚提交用户漏采；依赖读取不会触发旧头像和历史素材重传。
- 生成记录刷新以来源和快照时间为条件，旧批次重放不能回退新状态。旧会话追加消息继承位置；多轮语音可复用身份、归属、版本和正文一致的历史分段。
- 既有密码、微信身份、用户状态和已编辑绘本保持不覆盖。新兼容绘本导入；通用作品及财务实体保留加密原始档案，不产生钱包余额、订单履约或管理员权限。
- 每批是独立加密增量包，不能代替全量备份。密钥放在包外；控制台仅输出数量及运行状态。

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

```bash
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

4. 回填并对账。对账逐条检查生成正文、时间、归属、素材关联及摘要，验证新兼容绘本，按媒体类型抽样公开 R2 回读。成功后写认证收据，并以父批次/端点/截止时间 CAS 原子推进游标。出现 PENDING、映射错误或回读失败时游标不推进。

```bash
"$PYTHON" -m tools.legacy_sync.native_import \
  --package "$BATCH" --key-file "$KEY" --target-env "$TARGET" \
  --verified-mp-identity-file "$MP_PROOF" --phase assets
"$PYTHON" -m tools.legacy_sync.incremental_state \
  --package "$BATCH" --key-file "$KEY" --cursor-file "$CURSOR" \
  --target-env "$TARGET" --r2-public-env "$R2"
```

每次只运行一个管线。当前本地管线使用文件锁，子进程继承锁；收到停止信号会停止整个子进程组，避免残留上传器。中断后重放同一包可恢复，成功对象不会重复上传、原生 ID 不会重复插入；游标已经推进时同一批次可再次核验。过期或分叉父包应拒绝，不手工修改游标。

## 完成状态与缺口

`reports/incremental-reconciliation.enc` 保存本批计数、素材成功/缺失、公开回读及目标统计。`increment-cursor.json` 保存最新已应用包、包外密钥路径、来源端点和快照时间，同时保留所有历史缺失批次。

MISSING 表示本批已尝试但仍需补档，可以在原生数据对账通过后推进数据游标；不代表全部素材成功。素材补档继续使用原批次索引和密钥，不能靠推进数据库游标遗忘失败项。公开回读仅证明抽样文件字节一致，不保证所有媒体浏览器播放兼容。

后台验收：`http://localhost:3600/admin/users`、`http://localhost:3600/admin/ai-logs?source=LEGACY`。导入不修改页面、数据库 schema 或 seed。

## 后续开发要求

1. 通用旧作品（`app_ai_works`）需要原生档案结构和查询入口；模板、多结果批次、作品分组、公开状态及修订关系不能直接塞入 PictureBook。
2. 无通用修改时间的表只能保证新增主键。硬删除、未更新时间的原地修改以及晚提交且超出 10 分钟窗口的旧主键更新，需要 CDC 或定期全量核对。已有用户资料变更另需字段冲突合并规则。
3. 旧绘本正文的后续修订、企业/开放平台/助手的间接素材归属需要明确关系映射及冲突处理。
4. 订单、流水、余额和会员权益需要独立的类型、单位、状态和履约规则；当前仅留档。
5. 缺失或失效的旧素材需补源；AAC/M4A、Ogg 视频等后台播放兼容按已有迁移缺口继续处理。
