ALTER TABLE "picture_book_characters" ADD COLUMN "styleImages" JSONB NOT NULL DEFAULT '{}';

-- 保留已有绘本正在使用的角色图片；未使用过的旧图仍留在 imageUrl 作为身份参考。
UPDATE "picture_book_characters" AS character
SET "styleImages" = styles.images
FROM (
  SELECT character.id, jsonb_object_agg(book.style, character."imageUrl") AS images
  FROM "picture_book_characters" AS character
  JOIN "picture_books" AS book ON book."userId" = character."userId"
  WHERE character."imageUrl" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(book.characters) = 'array' THEN book.characters ELSE '[]'::jsonb END) AS selected
      WHERE selected->>'id' = character.id
    )
  GROUP BY character.id
) AS styles
WHERE character.id = styles.id;

-- 各绘本曾选用不同的角色图时，保留其历史快照；重新选形象后由应用移除兼容字段。
UPDATE "picture_books" AS book
SET characters = (
  SELECT jsonb_agg(CASE
    WHEN selected->>'imageUrl' IS NOT NULL AND selected->>'imageUrl' <> ''
    THEN selected || jsonb_build_object('legacyImageUrl', selected->>'imageUrl', 'legacyStyle', book.style)
    ELSE selected END ORDER BY ordinal)
  FROM jsonb_array_elements(book.characters) WITH ORDINALITY AS roles(selected, ordinal)
)
WHERE jsonb_typeof(book.characters) = 'array' AND jsonb_array_length(book.characters) > 0;
