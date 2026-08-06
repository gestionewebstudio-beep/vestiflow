-- Preferenza operatore della modalità prezzo (netto/ivato) per tipo documento.
-- Ricordata alla creazione, riproposta al documento successivo dello stesso
-- tipo, per (tenant, utente, tipo).
CREATE TABLE "user_document_price_mode_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "document_type" "DocumentType" NOT NULL,
  "prices_include_vat" BOOLEAN NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_document_price_mode_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_doc_price_mode_pref_tenant_user_type_key"
  ON "user_document_price_mode_preferences"("tenant_id", "user_id", "document_type");
CREATE INDEX "user_doc_price_mode_pref_tenant_user_idx"
  ON "user_document_price_mode_preferences"("tenant_id", "user_id");

-- Sicurezza (regole-sicurezza): RLS abilitata + REVOKE nella stessa migration.
-- L'API si connette come owner (bypassa RLS); la anon/authenticated key no.
ALTER TABLE "user_document_price_mode_preferences" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "user_document_price_mode_preferences" FROM anon, authenticated;

ALTER TABLE "user_document_price_mode_preferences"
  ADD CONSTRAINT "user_document_price_mode_preferences_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_document_price_mode_preferences"
  ADD CONSTRAINT "user_document_price_mode_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
