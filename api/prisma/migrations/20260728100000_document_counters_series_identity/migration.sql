-- Modello contatori consolidato: la serie è unica per (tenant, tipo); la sede
-- diventa un attributo di disponibilità, non parte dell'identità né della
-- partizione del numero. La serie può essere NULL («senza serie»). Aggiunto il
-- flag is_default (al più un contatore proposto per tipo).
--
-- Dati di test, nessuna migrazione da preservare: si azzera la tabella per
-- ripartire dal seed coerente col nuovo modello.

TRUNCATE TABLE "document_counters";

-- La serie diventa nullable («senza serie»).
ALTER TABLE "document_counters" ALTER COLUMN "series" DROP NOT NULL;

-- Nuovo flag: contatore proposto in testata (al più uno per tipo).
ALTER TABLE "document_counters" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- Via i vincoli vecchi basati anche sulla location.
DROP INDEX IF EXISTS "document_counters_tenant_id_type_series_location_id_key";
DROP INDEX IF EXISTS "document_counters_global_unique";

-- Identità (tenant, tipo, serie) con NULLS NOT DISTINCT: due «senza serie»
-- (serie NULL) dello stesso tipo collidono, quindi ne esiste al più uno.
CREATE UNIQUE INDEX "document_counters_tenant_id_type_series_key"
  ON "document_counters" ("tenant_id", "type", "series") NULLS NOT DISTINCT;

-- Al più un contatore predefinito per (tenant, tipo).
CREATE UNIQUE INDEX "document_counters_default_per_type"
  ON "document_counters" ("tenant_id", "type") WHERE "is_default";
