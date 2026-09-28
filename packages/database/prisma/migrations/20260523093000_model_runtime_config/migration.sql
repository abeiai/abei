ALTER TABLE "ai_model_instances"
  ADD COLUMN "baseUrl" TEXT,
  ADD COLUMN "webSocketUrl" TEXT,
  ADD COLUMN "region" TEXT,
  ADD COLUMN "apiKeyEncrypted" TEXT,
  ADD COLUMN "apiKeyPreview" TEXT;

UPDATE "ai_model_instances" AS model
SET
  "baseUrl" = provider."baseUrl",
  "webSocketUrl" = provider."webSocketUrl",
  "region" = provider."region"
FROM "ai_provider_instances" AS provider
WHERE model."providerInstanceId" = provider."id";
