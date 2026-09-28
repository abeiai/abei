UPDATE "learning_material_textbooks"
SET "grade" = '高一'
WHERE "grade" = '高一年级';

UPDATE "learning_material_textbooks"
SET "grade" = '一年级'
WHERE "grade" = '学生用书'
  AND "title" LIKE '%一年级%';

UPDATE "learning_material_textbooks"
SET "grade" = '七年级'
WHERE "grade" = '学生用书'
  AND "title" LIKE '%七年级%';

UPDATE "learning_material_textbooks"
SET "grade" = '八年级'
WHERE "grade" = '世界历史';

UPDATE "learning_material_textbooks"
SET "grade" = '六年级'
WHERE "grade" = '中国历史';
