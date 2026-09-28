-- Row-level BEFORE triggers still run after PostgreSQL has locked their target rows.
-- Acquire one relationship-domain advisory lock at statement start, before any row
-- or foreign-key lock, so identity changes cannot form an advisory/row-lock cycle.
CREATE OR REPLACE FUNCTION lock_course_revision_integrity_statement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('xueleai:course-revision-integrity:statement', 0)
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER "course_review_requests_targets_statement_lock"
BEFORE INSERT OR UPDATE OF "scope", "courseId", "courseRevisionId", "materialPublicationId"
ON "course_review_requests"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_revision_integrity_statement();

CREATE TRIGGER "courses_revision_ownership_statement_lock"
BEFORE INSERT OR UPDATE OF "id", "approvedRevisionId", "workingRevisionId"
ON "courses"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_revision_integrity_statement();

CREATE TRIGGER "course_revisions_ownership_statement_lock"
BEFORE UPDATE OF "id", "courseId"
ON "course_revisions"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_revision_integrity_statement();

CREATE OR REPLACE FUNCTION lock_course_material_publication_integrity_statement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('xueleai:course-material-publication-integrity:statement', 0)
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER "course_revision_items_publication_statement_lock"
BEFORE INSERT OR UPDATE OF "publicationId", "materialType", "videoGuideLessonId", "englishGuidedStudyMaterialId", "learningFlashcardDeckId"
ON "course_revision_items"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_material_publication_integrity_statement();

CREATE TRIGGER "course_material_publications_item_statement_lock"
BEFORE UPDATE OF "id", "materialType", "videoGuideLessonId", "englishGuidedStudyMaterialId", "learningFlashcardDeckId"
ON "course_material_publications"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_material_publication_integrity_statement();
