BEGIN;

ALTER TABLE "learning_material_textbooks"
ADD COLUMN "sourceUrl" TEXT;

UPDATE "learning_material_textbooks"
SET "sourceUrl" =
  'https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=' ||
  substring("slug" FROM 10) ||
  '&catalogType=tchMaterial&subCatalog=tchMaterial'
WHERE "slug" ~ '^smartedu-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

CREATE UNIQUE INDEX "learning_material_textbooks_sourceUrl_key"
ON "learning_material_textbooks"("sourceUrl");

COMMIT;
