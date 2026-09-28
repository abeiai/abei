import assert from "node:assert/strict";
import test from "node:test";

import { AudioService } from "../src/audio/audio.service.js";

test("ElevenLabs 默认音色同步更新已有记录并创建缺失记录且不删除旧音色", async () => {
  process.env.DATABASE_URL ??= "postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public";
  const service = new AudioService();
  const gatewayCalls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const updates: Array<Record<string, unknown>> = [];
  const creates: Array<Record<string, unknown>> = [];
  let lockCount = 0;
  const activeModel = {
    modelInstanceId: "model-eleven-multilingual",
    providerInstanceId: "provider-elevenlabs",
    providerKey: "elevenlabs_audio",
    providerName: "ElevenLabs 语音",
    providerDisplayName: "ElevenLabs 语音",
    adapterType: "ELEVENLABS_AUDIO",
    modelName: "eleven_multilingual_v2",
    baseUrl: "https://api.elevenlabs.io",
    webSocketUrl: null,
    region: "GLOBAL",
    apiKeyEncrypted: "encrypted",
    apiKeyEnvName: "ELEVENLABS_API_KEY",
    capabilityTags: ["AUDIO", "TTS", "SYSTEM_VOICE"],
    inputPrice: 1,
    outputPrice: 0,
    pricingMode: "CHARACTERS",
    pricingUnit: "TEN_K_CHARACTERS",
    pricingConfig: null
  };
  const internals = service as unknown as {
    prisma: unknown;
    ensureDashScopeAudioDefaults: () => Promise<void>;
    findFallbackAudioModel: () => Promise<typeof activeModel>;
    callAudioGateway: (path: string, model: typeof activeModel, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
    ensurePlatformVoiceOwnerUser: () => Promise<{ id: string }>;
  };

  internals.ensureDashScopeAudioDefaults = async () => undefined;
  internals.findFallbackAudioModel = async () => activeModel;
  internals.ensurePlatformVoiceOwnerUser = async () => ({ id: "platform-owner" });
  internals.callAudioGateway = async (path, _model, body) => {
    gatewayCalls.push({ path, body });
    return {
      provider: "elevenlabs_audio",
      voices: [
        {
          providerVoiceId: "voice-existing",
          name: "Aria Updated",
          description: "Warm narrator",
          previewAudioUrl: "https://cdn.example/aria.mp3",
          language: "en",
          labels: { gender: "female" }
        },
        {
          providerVoiceId: "voice-new",
          name: "Roger",
          description: null,
          previewAudioUrl: null,
          language: null,
          labels: { gender: "male" }
        }
      ]
    };
  };
  internals.prisma = {
    voiceAsset: {
      findMany: async () => {
        throw new Error("同步查询必须在并发锁事务内执行");
      }
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: async () => {
          lockCount += 1;
          return [{ locked: 1 }];
        },
        voiceAsset: {
          findMany: async () => [
            {
              id: "asset-existing",
              providerVoiceId: "voice-existing",
              status: "DISABLED"
            },
            {
              id: "asset-old",
              providerVoiceId: "voice-no-longer-returned",
              status: "READY"
            }
          ],
          update: async (input: Record<string, unknown>) => {
            updates.push(input);
            return input;
          },
          create: async (input: Record<string, unknown>) => {
            creates.push(input);
            return input;
          }
        }
      })
  };

  const result = await service.syncElevenLabsDefaultVoices("admin-1");

  assert.deepEqual(gatewayCalls, [
    {
      path: "/audio/providers/elevenlabs/voices/defaults",
      body: {
        model: "eleven_multilingual_v2",
        timeoutMs: 45000
      }
    }
  ]);
  assert.equal(lockCount, 1);
  assert.deepEqual(result, { total: 2, created: 1, updated: 1, skipped: 0 });
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    where: { id: "asset-existing" },
    data: {
      providerInstanceId: "provider-elevenlabs",
      name: "Aria Updated",
      targetModel: "eleven_multilingual_v2",
      language: "en",
      description: "Warm narrator",
      previewAudioUrl: "https://cdn.example/aria.mp3",
      reviewedByAdminId: "admin-1",
      reviewedAt: updates[0]?.data && (updates[0].data as { reviewedAt: unknown }).reviewedAt,
      reviewNote: "ElevenLabs 官方默认音色同步"
    }
  });
  assert.equal((updates[0]?.data as { status?: string }).status, undefined, "同步不能重新启用后台已禁用的音色");
  assert.equal(creates.length, 1);
  assert.deepEqual(creates[0], {
    data: {
      userId: "platform-owner",
      providerInstanceId: "provider-elevenlabs",
      provider: "elevenlabs_audio",
      providerVoiceId: "voice-new",
      name: "Roger",
      type: "SYSTEM",
      targetModel: "eleven_multilingual_v2",
      status: "READY",
      visibility: "PUBLIC",
      language: null,
      description: null,
      previewAudioUrl: null,
      isPlatform: true,
      reviewedByAdminId: "admin-1",
      reviewedAt: creates[0]?.data && (creates[0].data as { reviewedAt: unknown }).reviewedAt,
      reviewNote: "ElevenLabs 官方默认音色同步"
    }
  });
});
