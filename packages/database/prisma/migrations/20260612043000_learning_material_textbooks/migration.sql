-- CreateEnum
CREATE TYPE "TextbookEducationType" AS ENUM ('PRIMARY', 'JUNIOR', 'PRIMARY_FIVE_FOUR', 'JUNIOR_FIVE_FOUR', 'SENIOR', 'SPECIAL_EDUCATION');

-- CreateEnum
CREATE TYPE "TextbookVolume" AS ENUM ('FIRST_VOLUME', 'SECOND_VOLUME', 'FULL_VOLUME');

-- CreateTable
CREATE TABLE "learning_material_textbooks" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "educationType" "TextbookEducationType" NOT NULL,
    "subject" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "volume" "TextbookVolume" NOT NULL,
    "publisher" TEXT,
    "coverUrl" TEXT,
    "pdfUrl" TEXT,
    "mdUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_material_textbooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_material_textbooks_slug_key" ON "learning_material_textbooks"("slug");

-- CreateIndex
CREATE INDEX "learning_material_textbooks_educationType_subject_version_grade_idx" ON "learning_material_textbooks"("educationType", "subject", "version", "grade");

-- CreateIndex
CREATE INDEX "learning_material_textbooks_subject_idx" ON "learning_material_textbooks"("subject");

-- CreateIndex
CREATE INDEX "learning_material_textbooks_version_idx" ON "learning_material_textbooks"("version");

-- CreateIndex
CREATE INDEX "learning_material_textbooks_grade_idx" ON "learning_material_textbooks"("grade");
