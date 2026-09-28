ALTER TABLE "ai_model_presets" ADD COLUMN "pricingConfig" JSONB;

ALTER TABLE "ai_model_instances" ADD COLUMN "pricingConfig" JSONB;
