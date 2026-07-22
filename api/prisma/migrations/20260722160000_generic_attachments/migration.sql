-- Sottosistema Allegati generico (polimorfico): una sola tabella per gli
-- allegati di qualunque entità (documenti/Arrivi merce, ordini cliente, ...).
-- Solo METADATI: i byte restano su Supabase Storage (storage_path = chiave
-- dell'oggetto). L'integrità su entity_id è applicativa (l'entità è verificata
-- prima di ogni operazione), quindi nessuna FK su entity_id.
--
-- Non distruttiva: la tabella document_attachments resta invariata (Arrivi
-- merce continua a funzionare com'è). L'eventuale unificazione dei dati
-- documenti in questa tabella sarà una migrazione successiva dedicata.

CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attachments_tenant_id_entity_type_entity_id_idx" ON "attachments"("tenant_id", "entity_type", "entity_id");

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS come per tutte le altre tabelle (0003_enable_rls): abilitata senza policy
-- = default deny per anon/authenticated della Data API pubblica. Prisma si
-- connette come owner e continua a bypassare RLS: l'API NestJS non cambia.
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "attachments" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "attachments" FROM authenticated;
  END IF;
END
$$;
