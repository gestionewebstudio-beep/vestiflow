-- Step 8: collegamento ordine Shopify → documento DDT vendita
ALTER TABLE "sales_orders"
  ADD COLUMN "document_id" UUID;

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "sales_orders_document_id_key" ON "sales_orders"("document_id");
