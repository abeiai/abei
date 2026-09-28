-- Add sortable ordering for copybook fonts. Lower values appear first in the frontend.
ALTER TABLE "copybook_fonts" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 100;

CREATE INDEX "copybook_fonts_sortOrder_idx" ON "copybook_fonts"("sortOrder");
