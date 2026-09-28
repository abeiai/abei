-- 与 typing-scenario.ts 的内置配置一致，仅补缺失记录，保留已有管理员设置。
INSERT INTO "ai_scenarios" (
  "id", "name", "slug", "description", "promptTemplate",
  "promptVariables", "inputSchema", "requiredCapabilities", "costCredits",
  "isEnabled", "sortOrder", "isBuiltIn", "templateVersion",
  "minimumMembershipRank", "createdAt", "updatedAt"
) VALUES (
  'builtin-typing', '打字记词', 'typing', '通过听音、看中文和图片输入英文，并按记忆阶段复习错词。', '',
  '[]'::jsonb, '{"fields":[]}'::jsonb, '[]'::jsonb, 0,
  true, 36, true, '2026.08.27-v1', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;
