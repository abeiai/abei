-- Register the built-in MiniMax H3s provider and model without enabling live traffic.

INSERT INTO "ai_provider_presets" (
  "id",
  "providerKey",
  "displayName",
  "adapterType",
  "modality",
  "defaultBaseUrl",
  "apiKeyEnvName",
  "docsUrl",
  "region",
  "isBuiltIn",
  "isEnabledByDefault",
  "presetVersion",
  "lastUpdatedAt",
  "createdAt",
  "updatedAt"
)
VALUES (
  'builtin-minimax-h3s-video',
  'minimax_h3s_video',
  'MiniMax H3s 视频',
  'MINIMAX_VIDEO',
  'MULTIMODAL',
  'https://dmx04.sdts.net.cn',
  'MINIMAX_H3S_API_KEY',
  'https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create',
  'CHINA',
  TRUE,
  FALSE,
  '2026.08.12.1',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("providerKey") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "adapterType" = EXCLUDED."adapterType",
  "modality" = EXCLUDED."modality",
  "defaultBaseUrl" = EXCLUDED."defaultBaseUrl",
  "apiKeyEnvName" = EXCLUDED."apiKeyEnvName",
  "docsUrl" = EXCLUDED."docsUrl",
  "region" = EXCLUDED."region",
  "isBuiltIn" = TRUE,
  "presetVersion" = EXCLUDED."presetVersion",
  "lastUpdatedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ai_provider_instances" (
  "id",
  "providerPresetId",
  "name",
  "baseUrl",
  "region",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  'builtin-minimax-h3s-video-instance',
  "id",
  'MiniMax H3s 视频',
  'https://dmx04.sdts.net.cn',
  'CHINA',
  'DISABLED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ai_provider_presets"
WHERE "providerKey" = 'minimax_h3s_video'
  AND NOT EXISTS (
    SELECT 1
    FROM "ai_provider_instances"
    WHERE "providerPresetId" = "ai_provider_presets"."id"
  );

INSERT INTO "ai_model_presets" (
  "id",
  "providerPresetId",
  "modelKey",
  "displayName",
  "providerModelName",
  "capabilityTags",
  "pricingConfig",
  "supportsVision",
  "recommendedAlias",
  "createdAt",
  "updatedAt"
)
SELECT
  'builtin-minimax-h3s-model',
  "id",
  'minimax-h3s',
  'MiniMax H3s',
  'MiniMax-H3',
  '["VIDEO_GENERATION","TEXT_TO_VIDEO","IMAGE_TO_VIDEO","IMAGE_INPUT","REFERENCE_IMAGE","VIDEO_INPUT","REFERENCE_VIDEO","AUDIO","REFERENCE_AUDIO","PROMPT_REWRITE","CHINA_FRIENDLY"]'::jsonb,
  '{"mode":"VIDEO_SECONDS","currency":"CNY","unit":"SECOND","billingBasis":"OUTPUT_SECONDS","variants":[{"label":"480P 标准文生视频","resolution":"480P","jobMode":"STANDARD","taskType":"TEXT_TO_VIDEO","withAudio":false,"input":0,"output":0},{"label":"768P 标准文生视频","resolution":"768P","jobMode":"STANDARD","taskType":"TEXT_TO_VIDEO","withAudio":false,"input":0,"output":0}],"source":"https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create","note":"自建 MiniMax H3s 模型价格由管理员配置，预置价格为 0，配置完成前保持禁用。"}'::jsonb,
  TRUE,
  'video-generation',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ai_provider_presets"
WHERE "providerKey" = 'minimax_h3s_video'
ON CONFLICT ("providerPresetId", "modelKey") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "providerModelName" = EXCLUDED."providerModelName",
  "capabilityTags" = EXCLUDED."capabilityTags",
  "pricingConfig" = EXCLUDED."pricingConfig",
  "supportsVision" = TRUE,
  "recommendedAlias" = EXCLUDED."recommendedAlias",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ai_model_instances" (
  "id",
  "providerInstanceId",
  "modelPresetId",
  "displayName",
  "providerModelName",
  "capabilityTags",
  "pricingConfig",
  "pricingMode",
  "pricingUnit",
  "isEnabled",
  "createdAt",
  "updatedAt"
)
SELECT
  'builtin-minimax-h3s-model-instance',
  provider_instance."id",
  model_preset."id",
  'MiniMax H3s',
  'MiniMax-H3',
  model_preset."capabilityTags",
  model_preset."pricingConfig",
  'VIDEO_SECONDS',
  'SECOND',
  FALSE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ai_provider_presets" provider_preset
JOIN "ai_provider_instances" provider_instance
  ON provider_instance."providerPresetId" = provider_preset."id"
JOIN "ai_model_presets" model_preset
  ON model_preset."providerPresetId" = provider_preset."id"
  AND model_preset."modelKey" = 'minimax-h3s'
WHERE provider_preset."providerKey" = 'minimax_h3s_video'
  AND provider_instance."id" = (
    SELECT first_instance."id"
    FROM "ai_provider_instances" first_instance
    WHERE first_instance."providerPresetId" = provider_preset."id"
    ORDER BY first_instance."createdAt" ASC, first_instance."id" ASC
    LIMIT 1
  )
ON CONFLICT ("providerInstanceId", "providerModelName") DO UPDATE SET
  "modelPresetId" = EXCLUDED."modelPresetId",
  "displayName" = EXCLUDED."displayName",
  "capabilityTags" = EXCLUDED."capabilityTags",
  "updatedAt" = CURRENT_TIMESTAMP;
