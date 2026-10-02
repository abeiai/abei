ALTER TYPE "CourseMaterialType" ADD VALUE 'PICTURE_BOOK';

ALTER TABLE "course_revision_items" ADD COLUMN "pictureBookId" TEXT;
ALTER TABLE "course_material_publications" ADD COLUMN "pictureBookId" TEXT;

CREATE UNIQUE INDEX "course_material_publications_pictureBookId_key" ON "course_material_publications"("pictureBookId");

ALTER TABLE "course_revision_items" ADD CONSTRAINT "course_revision_items_pictureBookId_fkey" FOREIGN KEY ("pictureBookId") REFERENCES "picture_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_material_publications" ADD CONSTRAINT "course_material_publications_pictureBookId_fkey" FOREIGN KEY ("pictureBookId") REFERENCES "picture_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
