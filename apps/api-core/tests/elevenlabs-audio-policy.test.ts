import assert from "node:assert/strict";
import test from "node:test";

import {
  AudioService,
  assertTtsTextLimitForModel,
  isVoiceAssetCompatibleWithModel,
  preferredTtsModelsForVoiceAsset
} from "../src/audio/audio.service.js";

const elevenLabsModel = (modelName: string) => ({
  modelInstanceId: `model-${modelName}`,
  providerInstanceId: "provider-elevenlabs",
  providerKey: "elevenlabs_audio",
  providerName: "ElevenLabs 语音",
  providerDisplayName: "ElevenLabs 语音",
  adapterType: "ELEVENLABS_AUDIO",
  modelName,
  baseUrl: "https://api.elevenlabs.io",
  webSocketUrl: null,
  region: "GLOBAL",
  apiKeyEncrypted: "encrypted",
  apiKeyEnvName: "ELEVENLABS_API_KEY",
  capabilityTags: ["AUDIO", "TTS", "SYSTEM_VOICE"],
  inputPrice: 1,
  outputPrice: 0,
  pricingMode: "CHARACTERS" as const,
  pricingUnit: "TEN_K_CHARACTERS" as const,
  pricingConfig: null
});

test("语音模型分别遵守 Eleven v3 5000、IndexTTS 7000 与默认 8000 字符上限", () => {
  assert.doesNotThrow(() => assertTtsTextLimitForModel("测".repeat(5000), elevenLabsModel("eleven_v3")));
  assert.throws(
    () => assertTtsTextLimitForModel("测".repeat(5001), elevenLabsModel("eleven_v3")),
    /Eleven v3 单次最多合成 5000 个字符/
  );
  assert.doesNotThrow(() =>
    assertTtsTextLimitForModel("测".repeat(8000), elevenLabsModel("eleven_multilingual_v2"))
  );
  assert.doesNotThrow(() => assertTtsTextLimitForModel("测".repeat(7000), elevenLabsModel("IndexTTS-2.5")));
  assert.throws(() => assertTtsTextLimitForModel("测".repeat(7001), elevenLabsModel("IndexTTS-2.5")), /7000/);
});

test("ElevenLabs 默认音色可在三个指定模型间共享但不能跨 Provider 使用", () => {
  const voice = {
    provider: "elevenlabs_audio",
    targetModel: "eleven_multilingual_v2"
  };

  for (const modelName of ["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5"]) {
    assert.equal(isVoiceAssetCompatibleWithModel(voice, elevenLabsModel(modelName)), true);
  }

  assert.equal(
    isVoiceAssetCompatibleWithModel(
      { provider: "minimax_audio", targetModel: "eleven_multilingual_v2" },
      elevenLabsModel("eleven_multilingual_v2")
    ),
    false
  );
  assert.equal(
    isVoiceAssetCompatibleWithModel(voice, {
      ...elevenLabsModel("speech-2.8-turbo"),
      providerKey: "minimax_audio",
      adapterType: "MINIMAX_AUDIO"
    }),
    false
  );
});

test("ElevenLabs 默认音色不会把模型选择强制锁定到入库时的目标模型", () => {
  assert.deepEqual(
    preferredTtsModelsForVoiceAsset({
      provider: "elevenlabs_audio",
      targetModel: "eleven_multilingual_v2"
    }),
    ["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5"]
  );
  assert.deepEqual(
    preferredTtsModelsForVoiceAsset({
      provider: "aliyun_dashscope_audio",
      targetModel: "cosyvoice-v3-plus"
    }),
    ["cosyvoice-v3-plus"]
  );
});

test("语音模型选项包含未绑定别名但已启用的 ElevenLabs TTS 模型", async () => {
  const service = new AudioService();
  const internals = service as unknown as {
    prisma: unknown;
    ensureDashScopeAudioDefaults: () => Promise<void>;
  };

  internals.ensureDashScopeAudioDefaults = async () => undefined;
  internals.prisma = {
    systemConfig: {
      findUnique: async () => null
    },
    aiModelAlias: {
      findMany: async () => []
    },
    aiModelInstance: {
      findMany: async () => [
        {
          id: "model-eleven-v3",
          displayName: "Eleven v3",
          providerModelName: "eleven_v3",
          isEnabled: true,
          capabilityTags: ["AUDIO", "TTS", "SYSTEM_VOICE"],
          inputPrice: { toString: () => "10" },
          outputPrice: { toString: () => "0" },
          pricingMode: "CHARACTERS",
          pricingUnit: "TEN_K_CHARACTERS",
          pricingConfig: null,
          providerInstance: {
            name: "ElevenLabs",
            status: "ENABLED",
            providerPreset: {
              providerKey: "elevenlabs_audio",
              displayName: "ElevenLabs",
              adapterType: "ELEVENLABS_AUDIO",
              modality: "AUDIO"
            }
          }
        }
      ]
    }
  };

  const options = await service.listModelOptions();
  const elevenV3 = options.find((option) => option.modelName === "eleven_v3");

  assert.equal(elevenV3?.isConfigured, true);
  assert.equal(elevenV3?.providerName, "ElevenLabs");
});

test("ElevenLabs raw Voice ID 必须对应已登记且公开可用的平台音色", async () => {
  process.env.DATABASE_URL ??= "postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public";
  const service = new AudioService();
  let registeredVoice: Record<string, unknown> | null = null;
  const internals = service as unknown as {
    prisma: unknown;
    resolveVoice: (
      userId: string,
      voiceAssetId: string | undefined,
      voice: string | undefined,
      model: ReturnType<typeof elevenLabsModel>
    ) => Promise<{ voiceAssetId: string | null; providerVoiceId: string }>;
  };

  internals.prisma = {
    voiceAsset: {
      findFirst: async () => registeredVoice
    }
  };

  await assert.rejects(
    internals.resolveVoice("user-1", undefined, "private-workspace-voice", elevenLabsModel("eleven_multilingual_v2")),
    /请选择已同步且可用的 ElevenLabs 音色/
  );

  registeredVoice = {
    id: "voice-asset-1",
    provider: "elevenlabs_audio",
    providerVoiceId: "default-voice",
    targetModel: "eleven_multilingual_v2"
  };
  assert.deepEqual(
    await internals.resolveVoice("user-1", undefined, "default-voice", elevenLabsModel("eleven_v3")),
    {
      voiceAssetId: "voice-asset-1",
      providerVoiceId: "default-voice"
    }
  );
});
