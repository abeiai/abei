-- Register ElevenLabs TTS without enabling provider traffic or changing aliases.

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
  'builtin-elevenlabs-audio',
  'elevenlabs_audio',
  'ElevenLabs 语音',
  'ELEVENLABS_AUDIO',
  'AUDIO',
  'https://api.elevenlabs.io',
  'ELEVENLABS_API_KEY',
  'https://elevenlabs.io/docs/api-reference/text-to-speech/convert',
  'GLOBAL',
  TRUE,
  FALSE,
  '2026.08.18.1',
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
  'builtin-elevenlabs-audio-instance',
  "id",
  'ElevenLabs 语音',
  'https://api.elevenlabs.io',
  'GLOBAL',
  'DISABLED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ai_provider_presets"
WHERE "providerKey" = 'elevenlabs_audio'
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
  "supportsAudio",
  "createdAt",
  "updatedAt"
)
SELECT
  model_data."id",
  provider_preset."id",
  model_data."modelKey",
  model_data."displayName",
  model_data."providerModelName",
  '["AUDIO","TTS","SYSTEM_VOICE","MULTILINGUAL","GLOBAL"]'::jsonb,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ai_provider_presets" provider_preset
CROSS JOIN (
  VALUES
    ('builtin-eleven-v3-model', 'eleven-v3', 'Eleven v3', 'eleven_v3'),
    ('builtin-eleven-multilingual-v2-model', 'eleven-multilingual-v2', 'Eleven Multilingual v2', 'eleven_multilingual_v2'),
    ('builtin-eleven-flash-v2-5-model', 'eleven-flash-v2-5', 'Eleven Flash v2.5', 'eleven_flash_v2_5')
) AS model_data("id", "modelKey", "displayName", "providerModelName")
WHERE provider_preset."providerKey" = 'elevenlabs_audio'
ON CONFLICT ("providerPresetId", "modelKey") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "providerModelName" = EXCLUDED."providerModelName",
  "capabilityTags" = EXCLUDED."capabilityTags",
  "supportsAudio" = TRUE,
  "recommendedAlias" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ai_model_instances" (
  "id",
  "providerInstanceId",
  "modelPresetId",
  "displayName",
  "providerModelName",
  "baseUrl",
  "region",
  "capabilityTags",
  "inputPrice",
  "outputPrice",
  "pricingMode",
  "pricingUnit",
  "isEnabled",
  "createdAt",
  "updatedAt"
)
SELECT
  CASE model_preset."modelKey"
    WHEN 'eleven-v3' THEN 'builtin-eleven-v3-model-instance'
    WHEN 'eleven-multilingual-v2' THEN 'builtin-eleven-multilingual-v2-model-instance'
    ELSE 'builtin-eleven-flash-v2-5-model-instance'
  END,
  provider_instance."id",
  model_preset."id",
  model_preset."displayName",
  model_preset."providerModelName",
  provider_instance."baseUrl",
  provider_instance."region",
  model_preset."capabilityTags",
  1,
  0,
  'CHARACTERS',
  'TEN_K_CHARACTERS',
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ai_provider_presets" provider_preset
JOIN "ai_provider_instances" provider_instance
  ON provider_instance."providerPresetId" = provider_preset."id"
JOIN "ai_model_presets" model_preset
  ON model_preset."providerPresetId" = provider_preset."id"
WHERE provider_preset."providerKey" = 'elevenlabs_audio'
  AND model_preset."modelKey" IN ('eleven-v3', 'eleven-multilingual-v2', 'eleven-flash-v2-5')
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
