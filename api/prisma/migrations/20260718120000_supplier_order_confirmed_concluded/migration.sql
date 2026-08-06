-- Ordine fornitore (prompt 2026-07): stati Confermato/Concluso, nessun
-- effetto su giacenze/disponibilità, testata con Data e Rif. ordine
-- fornitore, righe con sconto/IVA e switch costi netto/ivato.

-- 1. Nuovo enum stati: draft/sent → confirmed (l'ordine nasce confermato),
--    partially_received → confirmed (non ancora concluso), received → concluded.
CREATE TYPE "SupplierOrderStatus_new" AS ENUM ('confirmed', 'concluded', 'cancelled');
ALTER TABLE "supplier_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "supplier_orders"
  ALTER COLUMN "status" TYPE "SupplierOrderStatus_new"
  USING (
    CASE "status"::text
      WHEN 'received' THEN 'concluded'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE 'confirmed'
    END
  )::"SupplierOrderStatus_new";
DROP TYPE "SupplierOrderStatus";
ALTER TYPE "SupplierOrderStatus_new" RENAME TO "SupplierOrderStatus";
ALTER TABLE "supplier_orders" ALTER COLUMN "status" SET DEFAULT 'confirmed';

-- 2. Testata: data ordine, rif. fornitore, modalità costi, totali con IVA.
--    La destinazione merce diventa opzionale (l'ordine non tocca il magazzino).
ALTER TABLE "supplier_orders"
  ADD COLUMN "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "supplier_reference" TEXT,
  ADD COLUMN "cost_entry_mode" "PurchaseCostEntryMode" NOT NULL DEFAULT 'vat_excluded',
  ADD COLUMN "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tax_minor" INTEGER NOT NULL DEFAULT 0,
  ALTER COLUMN "destination_location_id" DROP NOT NULL;

UPDATE "supplier_orders"
SET "order_date" = "created_at",
    "subtotal_minor" = "total_minor";

-- 3. Righe: descrizione articolo, costo digitato, sconto, Codice IVA
--    (snapshot come le righe documento) e totale riga netto.
ALTER TABLE "supplier_order_lines"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "entered_unit_cost_minor" INTEGER,
  ADD COLUMN "discount_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "vat_code_id" UUID,
  ADD COLUMN "vat_snapshot" JSONB,
  ADD COLUMN "line_total_minor" INTEGER NOT NULL DEFAULT 0;

UPDATE "supplier_order_lines"
SET "description" = "sku",
    "entered_unit_cost_minor" = "unit_cost_minor",
    "line_total_minor" = "ordered_quantity" * "unit_cost_minor";

ALTER TABLE "supplier_order_lines" ADD CONSTRAINT "supplier_order_lines_vat_code_id_fkey"
  FOREIGN KEY ("vat_code_id") REFERENCES "vat_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. L'ordine fornitore non alimenta più la quantità "In arrivo": azzera i
--    residui accumulati dal vecchio flusso inviato/ricevuto, che nessun
--    percorso aggiornerà più (sarebbero dati stantii permanenti).
UPDATE "inventory_levels" SET "incoming" = 0 WHERE "incoming" <> 0;
