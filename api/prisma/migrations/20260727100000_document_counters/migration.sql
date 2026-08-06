-- Contatori di numerazione configurabili (Impostazioni → numeratori).
-- Un contatore è la tripla (tipo, serie, location). NON memorizza il
-- progressivo: il prossimo numero è sempre max+1 sui documenti reali. La
-- location è opzionale (NULL = tutte le sedi). Il prefisso del riferimento
-- resta per-tipo su document_type_settings: qui si partiziona solo la serie
-- e la sede.

CREATE TABLE "document_counters" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "series" TEXT NOT NULL,
    "location_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_counters_tenant_id_idx" ON "document_counters"("tenant_id");

-- Identità del contatore con location valorizzata. NON copre il caso globale:
-- in Postgres i NULL sono distinti, quindi due contatori (tenant, tipo, serie)
-- con location NULL sfuggirebbero a questo vincolo.
CREATE UNIQUE INDEX "document_counters_tenant_id_type_series_location_id_key" ON "document_counters"("tenant_id", "type", "series", "location_id");

-- Chiude il buco: al più un contatore globale per (tenant, tipo, serie).
CREATE UNIQUE INDEX "document_counters_global_unique" ON "document_counters"("tenant_id", "type", "series") WHERE "location_id" IS NULL;

ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Location eliminata → i suoi contatori spariscono (numerazione della sede).
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS come per tutte le altre tabelle (0003_enable_rls): abilitata senza policy
-- = default deny per anon/authenticated della Data API pubblica. Prisma si
-- connette come owner e continua a bypassare RLS: l'API NestJS non cambia.
ALTER TABLE "document_counters" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "document_counters" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "document_counters" FROM authenticated;
  END IF;
END
$$;
