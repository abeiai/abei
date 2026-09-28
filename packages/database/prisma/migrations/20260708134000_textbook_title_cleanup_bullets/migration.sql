UPDATE "learning_material_textbooks"
SET "title" = btrim(regexp_replace("title", '^[·•・．\s]+', ''))
WHERE "title" ~ '^[·•・．\s]+';
