-- Repair the known production value without overwriting legitimate custom domains.
UPDATE "system_configs"
SET
  "value" = 'https://xueleai.com',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "key" = 'siteUrl'
  AND RTRIM("value", '/') = 'http://8.130.169.220';
