CREATE TABLE "copybook_fonts" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "storageProvider" "MediaStorageProvider" NOT NULL DEFAULT 'LOCAL',
  "suitableTemplates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "copybook_fonts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "copybook_fonts_filename_key" ON "copybook_fonts"("filename");
CREATE INDEX "copybook_fonts_createdByAdminId_idx" ON "copybook_fonts"("createdByAdminId");
CREATE INDEX "copybook_fonts_createdAt_idx" ON "copybook_fonts"("createdAt");
CREATE INDEX "copybook_fonts_name_idx" ON "copybook_fonts"("name");

ALTER TABLE "copybook_fonts" ADD CONSTRAINT "copybook_fonts_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
