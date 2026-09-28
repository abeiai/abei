BEGIN;

CREATE TABLE "course_enrollments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "course_enrollments_userId_addedAt_idx"
ON "course_enrollments"("userId", "addedAt");

CREATE INDEX "course_enrollments_courseId_idx"
ON "course_enrollments"("courseId");

CREATE UNIQUE INDEX "course_enrollments_userId_courseId_key"
ON "course_enrollments"("userId", "courseId");

ALTER TABLE "course_enrollments"
ADD CONSTRAINT "course_enrollments_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "course_enrollments"
ADD CONSTRAINT "course_enrollments_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
