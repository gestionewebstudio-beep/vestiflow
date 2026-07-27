-- Numerazione consolidata: riferimento PREFISSO[-SERIE]-NUMERO, l'anno esce
-- dalla numerazione, la serie è nullable (senza serie). Il progressivo è per
-- (tenant, tipo, serie). Estensione a ordini cliente (manuali) e fornitore.
-- Dati di test: nessuna migrazione da preservare.

-- ── Documenti ────────────────────────────────────────────────────────────────
-- Serie nullable, senza default (senza serie = NULL).
ALTER TABLE "documents" ALTER COLUMN "series" DROP DEFAULT;
ALTER TABLE "documents" ALTER COLUMN "series" DROP NOT NULL;

-- Via il vecchio vincolo che includeva l'anno.
DROP INDEX IF EXISTS "documents_tenant_id_type_series_year_number_key";

-- Unicità del numero per (tenant, tipo, serie), solo sui confermati
-- (number NOT NULL): le bozze (number NULL) non collidono; NULLS NOT DISTINCT
-- fa collidere i «senza serie» (serie NULL) sullo stesso numero.
CREATE UNIQUE INDEX "documents_number_unique"
  ON "documents" ("tenant_id", "type", "series", "number")
  NULLS NOT DISTINCT
  WHERE "number" IS NOT NULL;

CREATE INDEX "documents_tenant_id_type_series_idx"
  ON "documents" ("tenant_id", "type", "series");

-- ── Ordini cliente (SalesOrder) ──────────────────────────────────────────────
-- Numerazione interna solo per gli ordini manuali; i canali (Shopify/POS)
-- restano con il numero del canale e queste colonne a NULL.
ALTER TABLE "sales_orders" ADD COLUMN "series" TEXT;
ALTER TABLE "sales_orders" ADD COLUMN "number" INTEGER;

CREATE UNIQUE INDEX "sales_orders_number_unique"
  ON "sales_orders" ("tenant_id", "series", "number")
  NULLS NOT DISTINCT
  WHERE "source" = 'manual' AND "number" IS NOT NULL;

-- ── Ordini fornitore (SupplierOrder) ─────────────────────────────────────────
-- Tutti interni: il vincolo copre ogni riga con numero valorizzato.
ALTER TABLE "supplier_orders" ADD COLUMN "series" TEXT;
ALTER TABLE "supplier_orders" ADD COLUMN "number" INTEGER;

CREATE UNIQUE INDEX "supplier_orders_number_unique"
  ON "supplier_orders" ("tenant_id", "series", "number")
  NULLS NOT DISTINCT
  WHERE "number" IS NOT NULL;
