ALTER TABLE "course_revision_items" DROP CONSTRAINT "course_revision_items_one_source_check";

ALTER TABLE "course_revision_items" ADD CONSTRAINT "course_revision_items_one_source_check" CHECK (
  (("videoGuideLessonId" IS NOT NULL)::int +
   ("englishGuidedStudyMaterialId" IS NOT NULL)::int +
   ("learningFlashcardDeckId" IS NOT NULL)::int +
   ("pictureBookId" IS NOT NULL)::int) = 1
);

ALTER TABLE "course_revision_items" DROP CONSTRAINT "course_revision_items_material_type_source_check";

ALTER TABLE "course_revision_items" ADD CONSTRAINT "course_revision_items_material_type_source_check" CHECK (
  ("materialType" = 'VIDEO_GUIDE'
    AND "videoGuideLessonId" IS NOT NULL
    AND "englishGuidedStudyMaterialId" IS NULL
    AND "learningFlashcardDeckId" IS NULL
    AND "pictureBookId" IS NULL)
  OR
  ("materialType" = 'ENGLISH_GUIDED_STUDY'
    AND "videoGuideLessonId" IS NULL
    AND "englishGuidedStudyMaterialId" IS NOT NULL
    AND "learningFlashcardDeckId" IS NULL
    AND "pictureBookId" IS NULL)
  OR
  ("materialType" = 'LEARNING_FLASHCARD'
    AND "videoGuideLessonId" IS NULL
    AND "englishGuidedStudyMaterialId" IS NULL
    AND "learningFlashcardDeckId" IS NOT NULL
    AND "pictureBookId" IS NULL)
  OR
  ("materialType" = 'PICTURE_BOOK'
    AND "videoGuideLessonId" IS NULL
    AND "englishGuidedStudyMaterialId" IS NULL
    AND "learningFlashcardDeckId" IS NULL
    AND "pictureBookId" IS NOT NULL)
);

ALTER TABLE "course_material_publications" DROP CONSTRAINT "course_material_publications_one_source_check";

ALTER TABLE "course_material_publications" ADD CONSTRAINT "course_material_publications_one_source_check" CHECK (
  (("videoGuideLessonId" IS NOT NULL)::int +
   ("englishGuidedStudyMaterialId" IS NOT NULL)::int +
   ("learningFlashcardDeckId" IS NOT NULL)::int +
   ("pictureBookId" IS NOT NULL)::int) = 1
);

ALTER TABLE "course_material_publications" DROP CONSTRAINT "course_material_publications_material_type_source_check";

ALTER TABLE "course_material_publications" ADD CONSTRAINT "course_material_publications_material_type_source_check" CHECK (
  ("materialType" = 'VIDEO_GUIDE'
    AND "videoGuideLessonId" IS NOT NULL
    AND "englishGuidedStudyMaterialId" IS NULL
    AND "learningFlashcardDeckId" IS NULL
    AND "pictureBookId" IS NULL)
  OR
  ("materialType" = 'ENGLISH_GUIDED_STUDY'
    AND "videoGuideLessonId" IS NULL
    AND "englishGuidedStudyMaterialId" IS NOT NULL
    AND "learningFlashcardDeckId" IS NULL
    AND "pictureBookId" IS NULL)
  OR
  ("materialType" = 'LEARNING_FLASHCARD'
    AND "videoGuideLessonId" IS NULL
    AND "englishGuidedStudyMaterialId" IS NULL
    AND "learningFlashcardDeckId" IS NOT NULL
    AND "pictureBookId" IS NULL)
  OR
  ("materialType" = 'PICTURE_BOOK'
    AND "videoGuideLessonId" IS NULL
    AND "englishGuidedStudyMaterialId" IS NULL
    AND "learningFlashcardDeckId" IS NULL
    AND "pictureBookId" IS NOT NULL)
);

CREATE OR REPLACE FUNCTION course_material_source_key_was_cascaded(
  material_type "CourseMaterialType",
  old_video_id text,
  new_video_id text,
  old_english_id text,
  new_english_id text,
  old_flashcard_id text,
  new_flashcard_id text,
  old_picture_book_id text,
  new_picture_book_id text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  CASE material_type
    WHEN 'VIDEO_GUIDE' THEN
      RETURN old_video_id IS DISTINCT FROM new_video_id
        AND old_video_id IS NOT NULL
        AND new_video_id IS NOT NULL
        AND old_english_id IS NOT DISTINCT FROM new_english_id
        AND old_flashcard_id IS NOT DISTINCT FROM new_flashcard_id
        AND old_picture_book_id IS NOT DISTINCT FROM new_picture_book_id
        AND NOT EXISTS (
          SELECT 1 FROM "video_guide_lessons" WHERE "id" = old_video_id
        )
        AND EXISTS (
          SELECT 1 FROM "video_guide_lessons" WHERE "id" = new_video_id
        );
    WHEN 'ENGLISH_GUIDED_STUDY' THEN
      RETURN old_english_id IS DISTINCT FROM new_english_id
        AND old_english_id IS NOT NULL
        AND new_english_id IS NOT NULL
        AND old_video_id IS NOT DISTINCT FROM new_video_id
        AND old_flashcard_id IS NOT DISTINCT FROM new_flashcard_id
        AND old_picture_book_id IS NOT DISTINCT FROM new_picture_book_id
        AND NOT EXISTS (
          SELECT 1 FROM "english_guided_study_materials" WHERE "id" = old_english_id
        )
        AND EXISTS (
          SELECT 1 FROM "english_guided_study_materials" WHERE "id" = new_english_id
        );
    WHEN 'LEARNING_FLASHCARD' THEN
      RETURN old_flashcard_id IS DISTINCT FROM new_flashcard_id
        AND old_flashcard_id IS NOT NULL
        AND new_flashcard_id IS NOT NULL
        AND old_video_id IS NOT DISTINCT FROM new_video_id
        AND old_english_id IS NOT DISTINCT FROM new_english_id
        AND old_picture_book_id IS NOT DISTINCT FROM new_picture_book_id
        AND NOT EXISTS (
          SELECT 1 FROM "learning_flashcard_decks" WHERE "id" = old_flashcard_id
        )
        AND EXISTS (
          SELECT 1 FROM "learning_flashcard_decks" WHERE "id" = new_flashcard_id
        );
    WHEN 'PICTURE_BOOK' THEN
      RETURN old_picture_book_id IS DISTINCT FROM new_picture_book_id
        AND old_picture_book_id IS NOT NULL
        AND new_picture_book_id IS NOT NULL
        AND old_video_id IS NOT DISTINCT FROM new_video_id
        AND old_english_id IS NOT DISTINCT FROM new_english_id
        AND old_flashcard_id IS NOT DISTINCT FROM new_flashcard_id
        AND NOT EXISTS (SELECT 1 FROM "picture_books" WHERE "id" = old_picture_book_id)
        AND EXISTS (SELECT 1 FROM "picture_books" WHERE "id" = new_picture_book_id);
  END CASE;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_course_revision_item_publication_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM lock_course_material_publication_integrity_keys(ARRAY[NEW."publicationId"]);
  ELSE
    PERFORM lock_course_material_publication_integrity_keys(
      ARRAY[OLD."publicationId", NEW."publicationId"]
    );

    IF OLD."materialType" = NEW."materialType"
      AND course_material_source_key_was_cascaded(
        NEW."materialType",
        OLD."videoGuideLessonId",
        NEW."videoGuideLessonId",
        OLD."englishGuidedStudyMaterialId",
        NEW."englishGuidedStudyMaterialId",
        OLD."learningFlashcardDeckId",
        NEW."learningFlashcardDeckId",
        OLD."pictureBookId",
        NEW."pictureBookId"
      )
    THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "course_material_publications"
    WHERE "id" = NEW."publicationId"
      AND "materialType" = NEW."materialType"
      AND "videoGuideLessonId" IS NOT DISTINCT FROM NEW."videoGuideLessonId"
      AND "englishGuidedStudyMaterialId" IS NOT DISTINCT FROM NEW."englishGuidedStudyMaterialId"
      AND "learningFlashcardDeckId" IS NOT DISTINCT FROM NEW."learningFlashcardDeckId"
      AND "pictureBookId" IS NOT DISTINCT FROM NEW."pictureBookId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'course_revision_items_publication_match_check',
      MESSAGE = 'Course revision item material identity must match its publication';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_course_material_publication_item_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM lock_course_material_publication_integrity_keys(ARRAY[OLD."id", NEW."id"]);

  IF OLD."materialType" = NEW."materialType"
    AND course_material_source_key_was_cascaded(
      NEW."materialType",
      OLD."videoGuideLessonId",
      NEW."videoGuideLessonId",
      OLD."englishGuidedStudyMaterialId",
      NEW."englishGuidedStudyMaterialId",
      OLD."learningFlashcardDeckId",
      NEW."learningFlashcardDeckId",
      OLD."pictureBookId",
      NEW."pictureBookId"
    )
  THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "course_revision_items"
    WHERE "publicationId" IN (OLD."id", NEW."id")
      AND NOT (
        "materialType" = NEW."materialType"
        AND "videoGuideLessonId" IS NOT DISTINCT FROM NEW."videoGuideLessonId"
        AND "englishGuidedStudyMaterialId" IS NOT DISTINCT FROM NEW."englishGuidedStudyMaterialId"
        AND "learningFlashcardDeckId" IS NOT DISTINCT FROM NEW."learningFlashcardDeckId"
        AND "pictureBookId" IS NOT DISTINCT FROM NEW."pictureBookId"
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'course_material_publications_item_match_check',
      MESSAGE = 'Course material publication update would invalidate a revision item';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER "course_revision_items_publication_match_check" ON "course_revision_items";

CREATE TRIGGER "course_revision_items_publication_match_check"
BEFORE INSERT OR UPDATE OF "publicationId", "materialType", "videoGuideLessonId", "englishGuidedStudyMaterialId", "learningFlashcardDeckId", "pictureBookId"
ON "course_revision_items"
FOR EACH ROW
EXECUTE FUNCTION enforce_course_revision_item_publication_match();

DROP TRIGGER "course_revision_items_publication_statement_lock" ON "course_revision_items";

CREATE TRIGGER "course_revision_items_publication_statement_lock"
BEFORE INSERT OR UPDATE OF "publicationId", "materialType", "videoGuideLessonId", "englishGuidedStudyMaterialId", "learningFlashcardDeckId", "pictureBookId"
ON "course_revision_items"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_material_publication_integrity_statement();

DROP TRIGGER "course_material_publications_item_match_check" ON "course_material_publications";

CREATE TRIGGER "course_material_publications_item_match_check"
BEFORE UPDATE OF "id", "materialType", "videoGuideLessonId", "englishGuidedStudyMaterialId", "learningFlashcardDeckId", "pictureBookId"
ON "course_material_publications"
FOR EACH ROW
EXECUTE FUNCTION enforce_course_material_publication_item_match();

DROP TRIGGER "course_material_publications_item_statement_lock" ON "course_material_publications";

CREATE TRIGGER "course_material_publications_item_statement_lock"
BEFORE UPDATE OF "id", "materialType", "videoGuideLessonId", "englishGuidedStudyMaterialId", "learningFlashcardDeckId", "pictureBookId"
ON "course_material_publications"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_material_publication_integrity_statement();
