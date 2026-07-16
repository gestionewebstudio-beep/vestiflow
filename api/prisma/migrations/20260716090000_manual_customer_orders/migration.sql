-- Ordine cliente manuale (§Ordini cliente /app/sales).
-- 1) Tipo prodotto Articolo/Servizio: proprietà SOLO VestiFlow, mai mappata
--    su Shopify (i sync pull/push usano allowlist esplicite di campi).
--    Default `article` per tutti i record esistenti.
-- 2) Numeratore dedicato Ordine cliente: nuovo DocumentType `customer_order`
--    riusa DocumentSequence (stesso precedente di online_sale/corrispettivo).
-- 3) Testata e righe dell'ordine manuale su SalesOrder/SalesOrderLine:
--    location di origine, rif. esterno, consegna prevista, note, pagamento;
--    per riga sconto a cascata testuale, IVA con snapshot, spunta
--    "Impegna magazzino" e ordinamento.

CREATE TYPE "ProductKind" AS ENUM ('article', 'service');

ALTER TABLE "products"
  ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'article';

ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'customer_order';

-- Testata ordine manuale.
ALTER TABLE "sales_orders" ADD COLUMN "location_id" UUID;
ALTER TABLE "sales_orders" ADD COLUMN "external_ref" TEXT;
ALTER TABLE "sales_orders" ADD COLUMN "expected_delivery_date" DATE;
ALTER TABLE "sales_orders" ADD COLUMN "notes" TEXT;
ALTER TABLE "sales_orders" ADD COLUMN "payment_terms" TEXT;

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Righe ordine manuale.
ALTER TABLE "sales_order_lines" ADD COLUMN "line_number" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sales_order_lines" ADD COLUMN "barcode" TEXT;
ALTER TABLE "sales_order_lines" ADD COLUMN "unit_of_measure" TEXT;
ALTER TABLE "sales_order_lines" ADD COLUMN "discount" TEXT;
ALTER TABLE "sales_order_lines" ADD COLUMN "vat_code_id" UUID;
ALTER TABLE "sales_order_lines" ADD COLUMN "vat_snapshot" JSONB;
ALTER TABLE "sales_order_lines" ADD COLUMN "line_vat_total_minor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sales_order_lines" ADD COLUMN "commits_stock" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "sales_order_lines"
  ADD CONSTRAINT "sales_order_lines_vat_code_id_fkey"
  FOREIGN KEY ("vat_code_id") REFERENCES "vat_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
