-- Review requests must point to exactly the target required by their scope.
ALTER TABLE "course_review_requests"
ADD CONSTRAINT "course_review_requests_scope_targets_check" CHECK (
  (
    "scope" = 'COURSE_REVISION'
    AND "courseId" IS NOT NULL
    AND "courseRevisionId" IS NOT NULL
    AND "materialPublicationId" IS NULL
  )
  OR
  (
    "scope" = 'MATERIAL_CHANGE'
    AND "courseId" IS NULL
    AND "courseRevisionId" IS NULL
    AND "materialPublicationId" IS NOT NULL
  )
);

-- Material types must identify the one populated source column.
-- The original one-source checks remain in place as independent safeguards.
ALTER TABLE "course_revision_items"
ADD CONSTRAINT "course_revision_items_material_type_source_check" CHECK (
  (
    "materialType" = 'VIDEO_GUIDE'
    AND "videoGuideLessonId" IS NOT NULL
    AND "englishGuidedStudyMaterialId" IS NULL
    AND "learningFlashcardDeckId" IS NULL
  )
  OR
  (
    "materialType" = 'ENGLISH_GUIDED_STUDY'
    AND "videoGuideLessonId" IS NULL
    AND "englishGuidedStudyMaterialId" IS NOT NULL
    AND "learningFlashcardDeckId" IS NULL
  )
  OR
  (
    "materialType" = 'LEARNING_FLASHCARD'
    AND "videoGuideLessonId" IS NULL
    AND "englishGuidedStudyMaterialId" IS NULL
    AND "learningFlashcardDeckId" IS NOT NULL
  )
);

ALTER TABLE "course_material_publications"
ADD CONSTRAINT "course_material_publications_material_type_source_check" CHECK (
  (
    "materialType" = 'VIDEO_GUIDE'
    AND "videoGuideLessonId" IS NOT NULL
    AND "englishGuidedStudyMaterialId" IS NULL
    AND "learningFlashcardDeckId" IS NULL
  )
  OR
  (
    "materialType" = 'ENGLISH_GUIDED_STUDY'
    AND "videoGuideLessonId" IS NULL
    AND "englishGuidedStudyMaterialId" IS NOT NULL
    AND "learningFlashcardDeckId" IS NULL
  )
  OR
  (
    "materialType" = 'LEARNING_FLASHCARD'
    AND "videoGuideLessonId" IS NULL
    AND "englishGuidedStudyMaterialId" IS NULL
    AND "learningFlashcardDeckId" IS NOT NULL
  )
);

-- A course-scoped review must reference a revision owned by that course.
CREATE OR REPLACE FUNCTION enforce_course_review_request_targets()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."scope" = 'COURSE_REVISION' THEN
    PERFORM 1
    FROM "course_revisions"
    WHERE "id" = NEW."courseRevisionId"
      AND "courseId" = NEW."courseId"
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'course_review_requests_revision_course_check',
        MESSAGE = 'Course review request revision must belong to the referenced course';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "course_review_requests_targets_check"
AFTER INSERT OR UPDATE ON "course_review_requests"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION enforce_course_review_request_targets();

-- Course pointers may only reference revisions owned by the same course.
CREATE OR REPLACE FUNCTION enforce_course_revision_ownership_on_course()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."approvedRevisionId" IS NOT NULL THEN
    PERFORM 1
    FROM "course_revisions"
    WHERE "id" = NEW."approvedRevisionId"
      AND "courseId" = NEW."id"
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'courses_approved_revision_ownership_check',
        MESSAGE = 'Approved course revision must belong to the same course';
    END IF;
  END IF;

  IF NEW."workingRevisionId" IS NOT NULL THEN
    PERFORM 1
    FROM "course_revisions"
    WHERE "id" = NEW."workingRevisionId"
      AND "courseId" = NEW."id"
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'courses_working_revision_ownership_check',
        MESSAGE = 'Working course revision must belong to the same course';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "courses_revision_ownership_check"
AFTER INSERT OR UPDATE ON "courses"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION enforce_course_revision_ownership_on_course();

-- Updating a revision owner must not invalidate course pointers or reviews.
CREATE OR REPLACE FUNCTION enforce_course_revision_ownership_on_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM "courses"
  WHERE "approvedRevisionId" = NEW."id"
     OR "workingRevisionId" = NEW."id"
  FOR SHARE;

  IF EXISTS (
    SELECT 1
    FROM "courses"
    WHERE (
      "approvedRevisionId" = NEW."id"
      OR "workingRevisionId" = NEW."id"
    )
      AND "id" IS DISTINCT FROM NEW."courseId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'course_revisions_course_pointer_ownership_check',
      MESSAGE = 'Changing revision owner would invalidate a course revision pointer';
  END IF;

  PERFORM 1
  FROM "course_review_requests"
  WHERE "courseRevisionId" = NEW."id"
  FOR SHARE;

  IF EXISTS (
    SELECT 1
    FROM "course_review_requests"
    WHERE "courseRevisionId" = NEW."id"
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

CREATE CONSTRAINT TRIGGER "course_revisions_ownership_check"
AFTER UPDATE ON "course_revisions"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION enforce_course_revision_ownership_on_revision();

-- Revision items must duplicate the exact material identity of their publication.
CREATE OR REPLACE FUNCTION enforce_course_revision_item_publication_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM "course_material_publications"
  WHERE "id" = NEW."publicationId"
    AND "materialType" = NEW."materialType"
    AND "videoGuideLessonId" IS NOT DISTINCT FROM NEW."videoGuideLessonId"
    AND "englishGuidedStudyMaterialId" IS NOT DISTINCT FROM NEW."englishGuidedStudyMaterialId"
    AND "learningFlashcardDeckId" IS NOT DISTINCT FROM NEW."learningFlashcardDeckId"
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'course_revision_items_publication_match_check',
      MESSAGE = 'Course revision item material identity must match its publication';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "course_revision_items_publication_match_check"
AFTER INSERT OR UPDATE ON "course_revision_items"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION enforce_course_revision_item_publication_match();

-- Publication updates must not invalidate any existing revision item.
CREATE OR REPLACE FUNCTION enforce_course_material_publication_item_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM "course_revision_items"
  WHERE "publicationId" = NEW."id"
  FOR SHARE;

  IF EXISTS (
    SELECT 1
    FROM "course_revision_items"
    WHERE "publicationId" = NEW."id"
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

CREATE CONSTRAINT TRIGGER "course_material_publications_item_match_check"
AFTER UPDATE ON "course_material_publications"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION enforce_course_material_publication_item_match();

-- Constraint triggers do not scan existing rows when created, so validate them now.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "courses" AS course_record
    LEFT JOIN "course_revisions" AS approved_revision
      ON approved_revision."id" = course_record."approvedRevisionId"
    LEFT JOIN "course_revisions" AS working_revision
      ON working_revision."id" = course_record."workingRevisionId"
    WHERE (
      course_record."approvedRevisionId" IS NOT NULL
      AND approved_revision."courseId" IS DISTINCT FROM course_record."id"
    )
      OR (
        course_record."workingRevisionId" IS NOT NULL
        AND working_revision."courseId" IS DISTINCT FROM course_record."id"
      )
  ) THEN
    RAISE EXCEPTION 'Existing course revision pointer does not belong to its course';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "course_review_requests" AS review_request
    JOIN "course_revisions" AS revision
      ON revision."id" = review_request."courseRevisionId"
    WHERE review_request."scope" = 'COURSE_REVISION'
      AND revision."courseId" IS DISTINCT FROM review_request."courseId"
  ) THEN
    RAISE EXCEPTION 'Existing course review request revision does not belong to its course';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "course_revision_items" AS revision_item
    JOIN "course_material_publications" AS publication
      ON publication."id" = revision_item."publicationId"
    WHERE publication."materialType" IS DISTINCT FROM revision_item."materialType"
      OR publication."videoGuideLessonId" IS DISTINCT FROM revision_item."videoGuideLessonId"
      OR publication."englishGuidedStudyMaterialId" IS DISTINCT FROM revision_item."englishGuidedStudyMaterialId"
      OR publication."learningFlashcardDeckId" IS DISTINCT FROM revision_item."learningFlashcardDeckId"
  ) THEN
    RAISE EXCEPTION 'Existing course revision item does not match its material publication';
  END IF;
END;
$$;
