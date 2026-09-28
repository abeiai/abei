ALTER TABLE "billing_products"
  ADD COLUMN "benefitsMarkdown" TEXT;

UPDATE "billing_products"
SET "benefitsMarkdown" = '- 适合体验基础内容生成流程
- 支持基础 AI 对话、文章生成和工具体验
- 充值点数长期有效，可在用户中心查看流水'
WHERE "code" = 'starter' AND "benefitsMarkdown" IS NULL;

UPDATE "billing_products"
SET "benefitsMarkdown" = '- 适合连续使用和小规模内容运营
- 支持更高频的文本、图片、语音等体验区任务
- 推荐给正在验证工具站内容生产流程的用户'
WHERE "code" = 'growth' AND "benefitsMarkdown" IS NULL;

UPDATE "billing_products"
SET "benefitsMarkdown" = '- 适合高频任务和团队试运行
- 支持多场景 AI 任务消耗与钱包流水追踪
- 推荐给内容运营、产品验证和团队内部测试使用'
WHERE "code" = 'pro' AND "benefitsMarkdown" IS NULL;
