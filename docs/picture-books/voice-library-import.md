# xueleai 本地语音库导入

## 本次范围

- 来源：本机 xueleai 的系统音色数据文件、平台音色、关联试听资产，以及 `cosyVoiceSystemVoiceOverrides`。
- 目标：abei 独立数据库与 `abeiai` R2 桶。
- 代码范围：`scripts/audio/` 导入器和测试；`apps/api-core/src/audio/` 两个系统音色数据文件；对应测试。
- 不需要 schema migration 或 seed。来源导出使用单连接 `REPEATABLE READ READ ONLY` 事务。
- 角色状态、模型和音色标识保持来源值；服务商实例、平台归属和审核员映射到 abei。已有作品和私人音色保留。
- 目标平台库非空、ID 冲突、重复角色、缺失服务商或音频、其他系统配置混入时拒绝导入，避免直接删除历史引用。
- 30 个 LOCAL 试听资产先按文件大小及音频格式校验，再迁入 R2；数据库关联在一个 Serializable 事务中写入。已有公开 CDN/官方头像和试听 URL 按来源保留。
- 来源被禁用的角色继续禁用；导入音色资料不代表其服务商已启用。当前目标仅百炼语音启用，MiniMax / ElevenLabs 需已有服务商配置可用后才能合成。
- 本次发现“贾斯汀Justin”的无资产官方试听 GET 返回 404，保留角色资料并清空该失效链接；修正依据记录在导出包的 `source-media-fixes.json`。
- 实际短句合成检查发现“周文修老师”在 abei 返回 418；同一音色的 `query_voice` 用 abei 配置返回 `BadRequest.ResourceNotExist`，用 xueleai 本地配置返回 `OK` 且绑定 `cosyvoice-v3.5-plus`。角色资料与试听已导入，但这些百炼设计音色还需要对齐原语音配置后才能在本项目合成；配置切换须由用户确认。

## 导入与验收

导出包和导入前 `pg_dump` 备份放在已忽略的 `backups/voice-library-import/<run>/`，目录 0700、文件 0600；不提交数据库连接信息、备份或导出包。

```bash
pnpm --filter @xueleai/database exec node --import tsx ../../scripts/audio/import-xueleai-voice-library.mjs --source-dir backups/voice-library-import/<run> --stage-audio
pnpm --filter @xueleai/database exec node --import tsx ../../scripts/audio/import-xueleai-voice-library.mjs --source-dir backups/voice-library-import/<run> --apply
node --test scripts/audio/voice-library-import.test.mjs
pnpm --filter @xueleai/api-core typecheck
```

命令读取目标 `DATABASE_URL`；未设置时使用导出目录内权限受限的 `target-runtime.json`。仅允许 abei 的本地 3604 数据库。R2 上传日志、变换后的数据、导入结果保留在该备份目录。

集成测试使用环境变量 `VOICE_IMPORT_TEST_RUNTIME_FILE` 指定 abei 连接文件，`VOICE_IMPORT_TEST_SCHEMA_SQL` 指定由 Prisma `migrate diff --from-empty` 生成的建表 SQL。测试在随机临时 schema 内验证真实写入、外键关联和异常回滚，结束时只清理该临时 schema。

验收页面：`/admin/audio/voices`、绘本讲解语音选择界面。核对源/目标逐项数据、启停状态、平台归属、R2 音频大小与哈希，并检查实际试听。

百炼音色状态查询依据：[声音设计 API 参考](https://help.aliyun.com/zh/model-studio/voice-design-api-references)。418 排查依据：[官方错误码说明](https://help.aliyun.com/en/model-studio/error-code)。角色库的 `READY` 是导入的来源状态，不表示不同语音配置下都能立即合成。

## 恢复

系统音色文件原版和数据库备份均保留。恢复前先核对新增音色是否已被任务或默认音色引用；仅按本次导入清单处理，不恢复整库覆盖导入后的用户作品。已有引用时先停用对应角色，再安排引用迁移或人工恢复。数据库导入失败会整批回滚；上传后但尚未写库的 R2 对象可通过上传清单定位。
