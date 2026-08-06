-- DDT vendita (prompt DDT): testata operativa — "Seguirà doc. di vendita",
-- dati di trasporto e snapshot indirizzi intestatario/destinazione.
ALTER TABLE "documents"
  ADD COLUMN "followed_by_sales_doc" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "transport_causal" TEXT,
  ADD COLUMN "transport_start_at" TIMESTAMP(3),
  ADD COLUMN "transport_port" TEXT,
  ADD COLUMN "transport_carrier" TEXT,
  ADD COLUMN "transport_packages_count" INTEGER,
  ADD COLUMN "transport_weight" TEXT,
  ADD COLUMN "transport_goods_aspect" TEXT,
  ADD COLUMN "transport_shipping_code" TEXT,
  ADD COLUMN "transport_tracking_code" TEXT,
  ADD COLUMN "recipient_address" JSONB,
  ADD COLUMN "destination_address" JSONB;

-- Aggancio Ordine cliente → DDT da 1:1 a 1:N: un DDT può includere più
-- ordini cliente (Includi documento). L'indice unico diventa indice semplice.
DROP INDEX "sales_orders_document_id_key";
CREATE INDEX "sales_orders_document_id_idx" ON "sales_orders"("document_id");
