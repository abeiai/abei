-- 生成入口会校验 zitie 场景；只补缺失记录，不覆盖管理员已有配置。
-- 实际生成费用由 CopybooksService 按页数计算，场景基础费用保持为零。
INSERT INTO "ai_scenarios" (
  "id", "name", "slug", "description", "promptTemplate",
  "promptVariables", "inputSchema", "requiredCapabilities", "costCredits",
  "isEnabled", "sortOrder", "isBuiltIn", "templateVersion",
  "minimumMembershipRank", "createdAt", "updatedAt"
) VALUES (
  'builtin-zitie', '字帖生成', 'zitie', '生成、打印和导出练习字帖。', '',
  '[]'::jsonb, '{"fields":[]}'::jsonb, '[]'::jsonb, 0,
  true, 35, true, '2026.09.15-v1', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;
