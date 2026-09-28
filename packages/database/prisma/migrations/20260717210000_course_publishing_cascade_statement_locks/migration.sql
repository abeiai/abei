-- Relationship checks on cascaded child rows acquire their advisory domain lock.
-- Acquire that lock on each cascade origin before PostgreSQL locks the parent row,
-- otherwise a concurrent child write can hold the advisory lock while waiting for
-- the parent row and form a deadlock with the cascading statement.
CREATE TRIGGER "video_guide_lessons_course_publication_statement_lock"
BEFORE UPDATE OF "id"
ON "video_guide_lessons"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_material_publication_integrity_statement();

CREATE TRIGGER "english_guided_study_materials_course_publication_statement_lock"
BEFORE UPDATE OF "id"
ON "english_guided_study_materials"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_material_publication_integrity_statement();

CREATE TRIGGER "learning_flashcard_decks_course_publication_statement_lock"
BEFORE UPDATE OF "id"
ON "learning_flashcard_decks"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_material_publication_integrity_statement();

-- Deletes cascade through the same relationship graphs. Guard their roots so a
-- concurrent identity write cannot invert advisory-lock and row-lock ordering.
CREATE TRIGGER "courses_revision_ownership_delete_statement_lock"
BEFORE DELETE
ON "courses"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_revision_integrity_statement();

CREATE TRIGGER "course_revisions_ownership_delete_statement_lock"
BEFORE DELETE
ON "course_revisions"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_revision_integrity_statement();

CREATE TRIGGER "course_material_publications_item_delete_statement_lock"
BEFORE DELETE
ON "course_material_publications"
FOR EACH STATEMENT
EXECUTE FUNCTION lock_course_material_publication_integrity_statement();
