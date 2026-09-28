ALTER TABLE "learning_material_textbooks"
  ADD COLUMN "curriculumStandardYear" TEXT,
  ADD COLUMN "editionYear" TEXT;

UPDATE "learning_material_textbooks"
SET
  "curriculumStandardYear" = COALESCE(
    "curriculumStandardYear",
    substring("title" from '根据([0-9]{4})年版课程标准')
  ),
  "title" = btrim(
    regexp_replace(
      regexp_replace(
        "title",
        '^[（(]\s*根据\s*[0-9]{4}\s*年版课程标准[^）)]*[）)]\s*',
        ''
      ),
      '^义务教育教科书[·・．\s]*',
      ''
    )
  )
WHERE
  "title" ~ '^[（(]\s*根据\s*[0-9]{4}\s*年版课程标准'
  OR "title" ~ '^义务教育教科书[·・．\s]*';
