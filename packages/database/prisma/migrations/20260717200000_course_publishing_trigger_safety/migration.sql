-- Replace the broad deferrable constraint triggers. Their row locks ran for every
-- update and opposite parent/child lock ordering could deadlock unrelated writes.
DROP TRIGGER "course_review_requests_targets_check" ON "course_review_requests";
DROP TRIGGER "courses_revision_ownership_check" ON "courses";
DROP TRIGGER "course_revisions_ownership_check" ON "course_revisions";
DROP TRIGGER "course_revision_items_publication_match_check" ON "course_revision_items";
DROP TRIGGER "course_material_publications_item_match_check" ON "course_material_publications";

DROP FUNCTION enforce_course_review_request_targets();
DROP FUNCTION enforce_course_revision_ownership_on_course();
DROP FUNCTION enforce_course_revision_ownership_on_revision();
DROP FUNCTION enforce_course_revision_item_publication_match();
DROP FUNCTION enforce_course_material_publication_item_match();

-- Both sides of a course/revision relationship acquire the same transaction-level
-- advisory keys in lexical order. No parent/child row locks are held by these checks.
CREATE OR REPLACE FUNCTION lock_course_revision_integrity_keys(keys text[])
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('xueleai:course-revision:' || key_to_lock, 0)
  )
  FROM (
    SELECT DISTINCT key_to_lock
    FROM unnest(keys) AS supplied_keys(key_to_lock)
    WHERE key_to_lock IS NOT NULL
    ORDER BY key_to_lock
  ) AS ordered_keys;
END;
$$;

-- Both sides of a publication/item relationship use a separate advisory namespace.
CREATE OR REPLACE FUNCTION lock_course_material_publication_integrity_keys(keys text[])
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('xueleai:course-material-publication:' || key_to_lock, 0)
  )
  FROM (
    SELECT DISTINCT key_to_lock
    FROM unnest(keys) AS supplied_keys(key_to_lock)
    WHERE key_to_lock IS NOT NULL
    ORDER BY key_to_lock
  ) AS ordered_keys;
END;
$$;

-- Detect an ON UPDATE CASCADE from one of the three source tables. During the
-- child trigger, the old parent key is gone and the new key already exists.
CREATE OR REPLACE FUNCTION course_material_source_key_was_cascaded(
  material_type "CourseMaterialType",
  old_video_id text,
  new_video_id text,
  old_english_id text,
  new_english_id text,
  old_flashcard_id text,
  new_flashcard_id text
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
        AND NOT EXISTS (
          SELECT 1 FROM "learning_flashcard_decks" WHERE "id" = old_flashcard_id
        )
        AND EXISTS (
          SELECT 1 FROM "learning_flashcard_decks" WHERE "id" = new_flashcard_id
        );
  END CASE;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_course_review_request_targets()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM lock_course_revision_integrity_keys(ARRAY[NEW."courseRevisionId"]);
  ELSE
    PERFORM lock_course_revision_integrity_keys(
      ARRAY[OLD."courseRevisionId", NEW."courseRevisionId"]
    );
  END IF;

  -- Malformed target shapes are rejected by course_review_requests_scope_targets_check.
  IF NEW."scope" = 'COURSE_REVISION'
    AND NEW."courseId" IS NOT NULL
    AND NEW."courseRevisionId" IS NOT NULL
    AND NEW."materialPublicationId" IS NULL
  THEN
    IF TG_OP = 'UPDATE'
      AND OLD."courseId" IS DISTINCT FROM NEW."courseId"
      AND NOT EXISTS (SELECT 1 FROM "courses" WHERE "id" = OLD."courseId")
      AND EXISTS (SELECT 1 FROM "courses" WHERE "id" = NEW."courseId")
    THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
      AND OLD."courseRevisionId" IS DISTINCT FROM NEW."courseRevisionId"
      AND NOT EXISTS (SELECT 1 FROM "course_revisions" WHERE "id" = OLD."courseRevisionId")
      AND EXISTS (SELECT 1 FROM "course_revisions" WHERE "id" = NEW."courseRevisionId")
    THEN
      RETURN NEW;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "course_revisions"
      WHERE "id" = NEW."courseRevisionId"
        AND "courseId" = NEW."courseId"
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'course_review_requests_revision_course_check',
        MESSAGE = 'Course review request revision must belong to the referenced course';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "course_review_requests_targets_check"
BEFORE INSERT OR UPDATE OF "scope", "courseId", "courseRevisionId", "materialPublicationId"
ON "course_review_requests"
FOR EACH ROW
EXECUTE FUNCTION enforce_course_review_request_targets();

CREATE OR REPLACE FUNCTION enforce_course_revision_ownership_on_course()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  expected_course_id text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM lock_course_revision_integrity_keys(
      ARRAY[NEW."approvedRevisionId", NEW."workingRevisionId"]
    );
    expected_course_id := NEW."id";
  ELSE
    PERFORM lock_course_revision_integrity_keys(
      ARRAY[
        OLD."approvedRevisionId",
        OLD."workingRevisionId",
        NEW."approvedRevisionId",
        NEW."workingRevisionId"
      ]
    );
    expected_course_id := CASE
      WHEN OLD."id" IS DISTINCT FROM NEW."id" THEN OLD."id"
      ELSE NEW."id"
    END;
  END IF;

  IF NEW."approvedRevisionId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "course_revisions"
      WHERE "id" = NEW."approvedRevisionId"
        AND "courseId" = expected_course_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'courses_approved_revision_ownership_check',
      MESSAGE = 'Approved course revision must belong to the same course';
  END IF;

  IF NEW."workingRevisionId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "course_revisions"
      WHERE "id" = NEW."workingRevisionId"
        AND "courseId" = expected_course_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'courses_working_revision_ownership_check',
      MESSAGE = 'Working course revision must belong to the same course';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "courses_revision_ownership_check"
BEFORE INSERT OR UPDATE OF "id", "approvedRevisionId", "workingRevisionId"
ON "courses"
FOR EACH ROW
EXECUTE FUNCTION enforce_course_revision_ownership_on_course();

CREATE OR REPLACE FUNCTION enforce_course_revision_ownership_on_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM lock_course_revision_integrity_keys(ARRAY[OLD."id", NEW."id"]);

  -- A parent Course primary-key update cascades courseId to revisions and reviews.
  IF OLD."courseId" IS DISTINCT FROM NEW."courseId"
    AND NOT EXISTS (SELECT 1 FROM "courses" WHERE "id" = OLD."courseId")
    AND EXISTS (SELECT 1 FROM "courses" WHERE "id" = NEW."courseId")
  THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "courses"
    WHERE (
      "approvedRevisionId" IN (OLD."id", NEW."id")
      OR "workingRevisionId" IN (OLD."id", NEW."id")
    )
      AND "id" IS DISTINCT FROM NEW."courseId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'course_revisions_course_pointer_ownership_check',
      MESSAGE = 'Changing revision owner would invalidate a course revision pointer';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "course_review_requests"
    WHERE "courseRevisionId" IN (OLD."id", NEW."id")
      AND "courseId" IS DISTINCT FROM NEW."courseId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'course_revisions_review_request_ownership_check',
      MESSAGE = 'Changing revision owner would invalidate a course review request';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "course_revisions_ownership_check"
BEFORE UPDATE OF "id", "courseId"
ON "course_revisions"
FOR EACH ROW
EXECUTE FUNCTION enforce_course_revision_ownership_on_revision();

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
        NEW."learningFlashcardDeckId"
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
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'course_revision_items_publication_match_check',
      MESSAGE = 'Course revision item material identity must match its publication';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "course_revision_items_publication_match_check"
BEFORE INSERT OR UPDATE OF "publicationId", "materialType", "videoGuideLessonId", "englishGuidedStudyMaterialId", "learningFlashcardDeckId"
ON "course_revision_items"
FOR EACH ROW
EXECUTE FUNCTION enforce_course_revision_item_publication_match();

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
      NEW."learningFlashcardDeckId"
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

CREATE TRIGGER "course_material_publications_item_match_check"
BEFORE UPDATE OF "id", "materialType", "videoGuideLessonId", "englishGuidedStudyMaterialId", "learningFlashcardDeckId"
ON "course_material_publications"
FOR EACH ROW
EXECUTE FUNCTION enforce_course_material_publication_item_match();
