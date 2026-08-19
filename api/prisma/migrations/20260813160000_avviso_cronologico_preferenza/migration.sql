-- Avviso cronologico spento dall'operatore, per tipo documento (specifica
-- numerazione §4).
--
-- L'avviso segnala che dentro un contatore un numero più alto porta una data
-- ANTERIORE a uno più basso. È persistente: continua a comparire finché
-- l'anomalia resta nei dati, anche sui documenti successivi corretti — un buco
-- non giustificato va risolto, e un avviso che sparisce da solo lascia
-- dimenticare.
--
-- Chi lo spegne lo spegne per il SOLO tipo documento in cui è comparso: chi
-- sistema le fatture non resta cieco sui DDT. Da qui l'identità
-- (tenant, utente, tipo), la stessa di `user_document_price_mode_preferences`
-- di cui questa tabella copia la forma.
--
-- **L'esistenza della riga è la preferenza**: nessun booleano, perché non
-- esiste il caso «riacceso» — non c'è pannello nelle Impostazioni, e il rischio
-- è accettato: una spunta presa per sbaglio è definitiva per quell'operatore e
-- quel tipo. `dismissed_at` serve solo a sapere quando, visto che l'unico
-- rimedio è il database.
CREATE TABLE "user_document_chronology_warning_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "document_type" "DocumentType" NOT NULL,
  "dismissed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_document_chronology_warning_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_doc_chrono_warn_pref_tenant_user_type_key"
  ON "user_document_chronology_warning_preferences"("tenant_id", "user_id", "document_type");
CREATE INDEX "user_doc_chrono_warn_pref_tenant_user_idx"
  ON "user_document_chronology_warning_preferences"("tenant_id", "user_id");

-- Sicurezza (regole-sicurezza): RLS abilitata + REVOKE nella stessa migration.
-- L'API si connette come owner (bypassa RLS); la anon/authenticated key no.
ALTER TABLE "user_document_chronology_warning_preferences" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "user_document_chronology_warning_preferences" FROM anon, authenticated;

ALTER TABLE "user_document_chronology_warning_preferences"
  ADD CONSTRAINT "user_doc_chrono_warn_pref_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_document_chronology_warning_preferences"
  ADD CONSTRAINT "user_doc_chrono_warn_pref_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
