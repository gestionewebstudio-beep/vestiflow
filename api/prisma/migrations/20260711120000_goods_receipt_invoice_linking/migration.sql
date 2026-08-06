-- Arrivo merce / Registrazione fattura: movimento per riga documento,
-- causali di carico gestibili, link fattura registrata <-> arrivi merce.

-- StockMovement: riferimenti alla riga documento origine (un movimento per riga).
ALTER TABLE "stock_movements"
  ADD COLUMN "source_document_type" "DocumentType",
  ADD COLUMN "source_document_id" UUID,
  ADD COLUMN "source_line_id" UUID;

CREATE UNIQUE INDEX "stock_movements_source_document_type_source_line_id_key"
  ON "stock_movements" ("source_document_type", "source_line_id");

CREATE INDEX "stock_movements_source_document_id_idx"
  ON "stock_movements" ("source_document_id");

-- Document: causale di carico e tipo riferimento fornitore.
ALTER TABLE "documents"
  ADD COLUMN "causal_text" TEXT,
  ADD COLUMN "supplier_ref_type" TEXT;

-- Backfill: la causale di carico degli arrivi merce viveva in internal_comment.
UPDATE "documents"
SET "causal_text" = "internal_comment"
WHERE "type" IN ('goods_receipt', 'supplier_ddt', 'supplier_invoice_accompanying', 'manual_load', 'initial_load')
  AND "internal_comment" IS NOT NULL
  AND "causal_text" IS NULL;

-- DocumentLine: riga riepilogativa di registrazione fattura -> arrivo merce.
ALTER TABLE "document_lines"
  ADD COLUMN "linked_goods_receipt_id" UUID;

ALTER TABLE "document_lines"
  ADD CONSTRAINT "document_lines_linked_goods_receipt_id_fkey"
  FOREIGN KEY ("linked_goods_receipt_id") REFERENCES "documents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "document_lines_linked_goods_receipt_id_idx"
  ON "document_lines" ("linked_goods_receipt_id");

-- Causali di carico per tenant.
CREATE TABLE "goods_receipt_causals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "goods_receipt_causals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "goods_receipt_causals"
  ADD CONSTRAINT "goods_receipt_causals_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "goods_receipt_causals_tenant_id_label_key"
  ON "goods_receipt_causals" ("tenant_id", "label");

CREATE INDEX "goods_receipt_causals_tenant_id_sort_order_idx"
  ON "goods_receipt_causals" ("tenant_id", "sort_order");

ALTER TABLE "goods_receipt_causals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "goods_receipt_causals" FROM anon, authenticated;

-- Link fattura registrata <-> arrivo merce (solo documentale, mai stock).
CREATE TABLE "purchase_invoice_goods_receipt_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "purchase_invoice_id" UUID NOT NULL,
  "goods_receipt_id" UUID NOT NULL,
  "linked_net_minor" INTEGER NOT NULL DEFAULT 0,
  "linked_vat_minor" INTEGER NOT NULL DEFAULT 0,
  "linked_gross_minor" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_invoice_goods_receipt_links_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "purchase_invoice_goods_receipt_links"
  ADD CONSTRAINT "purchase_invoice_goods_receipt_links_purchase_invoice_id_fkey"
  FOREIGN KEY ("purchase_invoice_id") REFERENCES "documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_invoice_goods_receipt_links"
  ADD CONSTRAINT "purchase_invoice_goods_receipt_links_goods_receipt_id_fkey"
  FOREIGN KEY ("goods_receipt_id") REFERENCES "documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "purchase_invoice_goods_receipt_links_invoice_receipt_key"
  ON "purchase_invoice_goods_receipt_links" ("purchase_invoice_id", "goods_receipt_id");

CREATE INDEX "purchase_invoice_goods_receipt_links_tenant_receipt_idx"
  ON "purchase_invoice_goods_receipt_links" ("tenant_id", "goods_receipt_id");

CREATE INDEX "purchase_invoice_goods_receipt_links_tenant_invoice_idx"
  ON "purchase_invoice_goods_receipt_links" ("tenant_id", "purchase_invoice_id");

ALTER TABLE "purchase_invoice_goods_receipt_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "purchase_invoice_goods_receipt_links" FROM anon, authenticated;
