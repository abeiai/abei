CREATE TABLE "copybook_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT,
  "templateId" TEXT NOT NULL,
  "templateName" TEXT NOT NULL,
  "contentPreview" TEXT NOT NULL,
  "pdfFilename" TEXT NOT NULL,
  "pdfObjectKey" TEXT NOT NULL,
  "pdfUrl" TEXT NOT NULL,
  "pdfSize" INTEGER NOT NULL,
  "credits" INTEGER NOT NULL,
  "pageCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "copybook_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "copybook_records_pdfObjectKey_key" ON "copybook_records"("pdfObjectKey");
CREATE UNIQUE INDEX "copybook_records_userId_requestId_key" ON "copybook_records"("userId", "requestId");
CREATE INDEX "copybook_records_userId_createdAt_idx" ON "copybook_records"("userId", "createdAt");
CREATE INDEX "copybook_records_createdAt_idx" ON "copybook_records"("createdAt");

ALTER TABLE "copybook_records"
  ADD CONSTRAINT "copybook_records_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
