# ElevenLabs 语音合成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有语音工作台、任务计费和音频持久化链路中加入 ElevenLabs 三个 TTS 模型，并支持后台安全配置和同步官方默认音色。

**Architecture:** 新增 `ELEVENLABS_AUDIO` Provider 类型，由 NestJS 继续处理鉴权、模型选择、计费和任务状态，FastAPI AI Gateway 负责 ElevenLabs REST 协议、二进制音频标准化与上游错误映射。默认音色通过后台操作分页读取后幂等写入现有平台 `VoiceAsset`。

**Tech Stack:** pnpm Monorepo、Prisma 7、PostgreSQL、NestJS 11、FastAPI/Pydantic、Next.js 16 App Router、TypeScript 6、Python 3.11、Node Test Runner、unittest。

## Global Constraints

- 真实 API Key 只保存到现有加密 Provider 凭据，不写入源码、迁移、测试、文档、日志或 Git。
- 不改动当前默认 TTS 模型别名，不导入个人、社区、工作区、克隆或生成音色。
- 不新增 ElevenLabs 语音识别、声音设计、声音复刻、流式 TTS 或独立前端页面。
- 所有可见错误使用简体中文，API 保持现有统一响应结构。
- 生产迁移必须向前兼容，不执行 `prisma migrate reset`，不删除既有 Provider、模型或音色。
- 当前工作区有大量无关改动；只暂存本计划列出的 ElevenLabs 文件，修改共享文件前先核对现有 diff。
- 每个行为先写测试并确认预期失败，再写最小实现；完成时运行相关测试、类型检查、lint、build、独立审查和最终验真。

## Task 1: 建立 Provider 枚举、预设和迁移

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/prisma/ai-preset-data.ts`
- Modify: `packages/database/prisma/seed-ai-presets.ts`
- Modify: `packages/database/prisma/ai-preset-data.test.ts`
- Create: `packages/database/prisma/migrations/20260818110000_elevenlabs_audio/migration.sql`

- [ ] 在 `ai-preset-data.test.ts` 增加失败测试，要求存在 `elevenlabs_audio`、`ELEVENLABS_AUDIO` 和三个指定模型，且不自动推荐覆盖模型别名。
- [ ] 运行 `pnpm --filter @xueleai/database exec node --import tsx --test prisma/ai-preset-data.test.ts`，确认测试因预设缺失而失败。
- [ ] 在 Prisma Adapter 枚举、Provider 预设、音频 Adapter 白名单和幂等 SQL 迁移中加入 ElevenLabs。
- [ ] 迁移写入内置 Provider、Provider Instance、三个模型预设和模型实例；默认 Provider 为 `DISABLED`，模型实例可配置但不绑定现有别名。
- [ ] 运行数据库预设测试和 `pnpm --filter @xueleai/database db:generate`。

## Task 2: 以 TDD 实现 ElevenLabs Gateway Adapter

**Files:**
- Create: `apps/ai-gateway/tests/test_elevenlabs_audio_adapter.py`
- Create: `apps/ai-gateway/app/audio_gateway/providers/elevenlabs_audio_adapter.py`
- Modify: `apps/ai-gateway/app/audio_gateway/providers/__init__.py`

- [ ] 写失败测试覆盖 `xi-api-key`、URL 编码 Voice ID、三个模型、MP3/Opus/WAV 映射、语速、二进制 Base64、MIME、请求 ID、5000 字符限制和错误脱敏。
- [ ] 运行 `pnpm --filter @xueleai/ai-gateway exec node ../../scripts/python311.mjs -m unittest tests.test_elevenlabs_audio_adapter`，确认因 Adapter 缺失而失败。
- [ ] 使用标准库 HTTP 客户端实现最小 Adapter；测试通过模拟传输捕获请求，不访问真实 API。
- [ ] 对 401/403、404、422、429、超时和 5xx 返回稳定内部错误码与简体中文消息。
- [ ] 重新运行单文件测试并确认通过。

## Task 3: 接入 Gateway 路由与 Provider 连接测试

**Files:**
- Modify: `apps/ai-gateway/app/main.py`
- Modify: `apps/api-core/src/ai/provider-adapters.ts`
- Modify: `apps/api-core/src/ai/dto/advanced-ai.dto.ts`
- Modify: `apps/web/src/components/ai/provider-preset-list.tsx`
- Create: `apps/api-core/tests/elevenlabs-provider-adapter.test.ts`

- [ ] 写失败测试，要求 `getProviderAdapter("ELEVENLABS_AUDIO")` 使用非计费 Gateway 连接测试，并且密钥只在请求体中传给本地 Gateway。
- [ ] 在 Gateway 增加 ElevenLabs Provider 测试、默认音色读取和 `/audio/tts` 分派。
- [ ] 在 API Core 和后台 Provider 表单加入新的 Adapter 类型与中文名称。
- [ ] 运行 `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/elevenlabs-provider-adapter.test.ts` 和 Gateway 单测。

## Task 4: 扩展 Audio Service 模型和音色兼容边界

**Files:**
- Modify: `apps/api-core/src/audio/audio.service.ts`
- Create: `apps/api-core/tests/elevenlabs-audio-policy.test.ts`

- [ ] 写失败测试覆盖 `ELEVENLABS_AUDIO` 被识别为音频 Provider、`eleven_v3` 预请求字符上限、三模型共享 ElevenLabs 音色，以及音色不能跨 Provider 使用。
- [ ] 将 ElevenLabs 加入默认 Provider 初始化、后台语音模型列表、回退模型查询和类型守卫。
- [ ] 在解析模型后、冻结点数和外部请求前执行模型字符限制。
- [ ] 兼容性同时校验 `VoiceAsset.provider`；仅 `elevenlabs_audio` 的平台音色可在三个 ElevenLabs 模型间共享。
- [ ] 运行新增策略测试和现有音频安全测试。

## Task 5: 实现默认音色分页同步与幂等入库

**Files:**
- Modify: `apps/api-core/src/audio/audio.service.ts`
- Modify: `apps/api-core/src/audio/admin-audio.controller.ts`
- Modify: `apps/api-core/src/audio/dto/audio.dto.ts`
- Create: `apps/api-core/tests/elevenlabs-voice-sync.test.ts`

- [ ] 写失败测试覆盖分页、只接受默认音色、元数据归一化、重复同步更新不重复创建，以及上游缺失音色不被自动删除。
- [ ] 通过 Gateway 使用已配置 Provider 凭据读取 `voice_type=default`，不接受客户端传入 API Key。
- [ ] 复用平台音色所有者，按 `provider + providerVoiceId + isPlatform` 更新或创建 `VoiceAsset`，记录名称、描述、语言与试听链接。
- [ ] 返回新增数、更新数、跳过数和总数；失败时不暴露上游响应中的敏感内容。
- [ ] 运行新增同步测试。

## Task 6: 后台增加同步操作

**Files:**
- Modify: `apps/web/src/lib/audio-admin-api.ts`
- Modify: `apps/web/src/app/admin/audio/voices/page.tsx`
- Create or Modify: `apps/web/tests/elevenlabs-audio-admin.test.ts`

- [ ] 写失败测试，要求后台音色库出现“同步 ElevenLabs 默认音色”，Server Action 只调用受管理员鉴权保护的同步 API。
- [ ] 增加同步按钮、提交状态和结果反馈；Provider 未启用或未配置凭据时显示简短错误。
- [ ] 不在客户端字段、HTML、URL、日志或返回数据中出现 API Key。
- [ ] 运行 Web 针对性测试和 `pnpm --filter @xueleai/web typecheck`。

## Task 7: 本地迁移、加密配置与真实验收

**Files:**
- No committed secret files.

- [ ] 对本地数据库执行 `pnpm db:migrate` 和 `pnpm ai:seed-presets`。
- [ ] 使用现有加密凭据能力把用户提供的 Key 保存到本地 `elevenlabs_audio` Provider，并启用 Provider；不回显 Key。
- [ ] 执行非计费连接测试，确认三个模型在后台可见。
- [ ] 执行默认音色同步，核对只导入官方默认音色及试听链接。
- [ ] 使用短中文文本完成一次真实 MP3 合成，确认任务成功、音频可播放、点数与使用日志正常。

## Task 8: 最终验真与审查

- [ ] 运行 `pnpm --filter @xueleai/database test`。
- [ ] 运行 `pnpm --filter @xueleai/ai-gateway test`。
- [ ] 运行 API Core ElevenLabs、音频安全和 Provider 相关测试。
- [ ] 运行 `pnpm --filter @xueleai/api-core typecheck`、`pnpm --filter @xueleai/web typecheck`。
- [ ] 运行三个受影响包的 lint 和 build。
- [ ] 检查 `git diff`、`git diff --check` 和敏感信息扫描，确认真实 Key 未进入跟踪文件。
- [ ] 独立审查 Provider 协议、音色公开边界、计费失败释放和密钥脱敏；修复高、中风险问题后只重跑受影响验证。
- [ ] 最终汇报修改文件、真实 API 验收结果，以及未执行的发布步骤；本任务不推送 GitHub、不部署线上。

