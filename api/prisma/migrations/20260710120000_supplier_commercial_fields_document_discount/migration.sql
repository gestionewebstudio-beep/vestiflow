-- Condizioni commerciali fornitore + sconto extra documento
ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "supplier_discount" TEXT,
  ADD COLUMN IF NOT EXISTS "default_vat_rate_percent" INTEGER,
  ADD COLUMN IF NOT EXISTS "transport_responsible" TEXT,
  ADD COLUMN IF NOT EXISTS "freight_terms" TEXT,
  ADD COLUMN IF NOT EXISTS "document_creation_note" TEXT;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "document_discount_percent" INTEGER NOT NULL DEFAULT 0;
