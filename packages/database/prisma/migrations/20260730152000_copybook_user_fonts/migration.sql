ALTER TABLE "copybook_fonts" ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "copybook_fonts_createdByUserId_idx" ON "copybook_fonts"("createdByUserId");

ALTER TABLE "copybook_fonts"
  ADD CONSTRAINT "copybook_fonts_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
