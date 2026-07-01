-- Collegamento documento ↔ ordine fornitore (§10.1).
ALTER TABLE "documents" ADD COLUMN "supplier_order_id" UUID;

ALTER TABLE "document_lines" ADD COLUMN "supplier_order_line_id" UUID;

CREATE INDEX "documents_tenant_id_supplier_order_id_idx" ON "documents"("tenant_id", "supplier_order_id");

ALTER TABLE "documents" ADD CONSTRAINT "documents_supplier_order_id_fkey"
  FOREIGN KEY ("supplier_order_id") REFERENCES "supplier_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_supplier_order_line_id_fkey"
  FOREIGN KEY ("supplier_order_line_id") REFERENCES "supplier_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
