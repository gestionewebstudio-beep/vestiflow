-- Anagrafica canonica (logica Danea): soggetto unico + ruoli cliente/fornitore.
--
-- I dati anagrafici, fiscali, di contatto e gli indirizzi si spostano nella
-- nuova tabella "parties" e vengono conservati UNA SOLA VOLTA per soggetto.
-- "customers" e "suppliers" restano come tabelle di RUOLO (gli id non cambiano:
-- documenti, ordini e storico continuano a puntare alle stesse righe) e
-- conservano solo i dati commerciali del ruolo, più:
--   - is_active: la disattivazione del ruolo esclude dai nuovi utilizzi
--     senza eliminare dati, documenti o collegamenti storici;
--   - customers.code: codice cliente progressivo (come il codice fornitore);
--   - payment_method / payment_terms: modalità e condizioni di pagamento
--     (due voci separate, gestite in Impostazioni → Pagamenti);
--   - document_creation_alert ("Mostra avviso") e document_creation_note
--     ("Inserisci nota") su entrambi i ruoli.
--
-- Le coppie già collegate via customers.linked_supplier_id confluiscono in un
-- UNICO soggetto. Copie integrali pre-migrazione restano in
-- _backup_customers_pre_party / _backup_suppliers_pre_party (eliminabili poi).

-- ── 1. Enum e tabella voci pagamento ─────────────────────────────────────────

CREATE TYPE "PaymentOptionKind" AS ENUM ('method', 'terms');

CREATE TABLE "payment_options" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "kind" "PaymentOptionKind" NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_options_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_options_tenant_id_kind_name_key"
  ON "payment_options" ("tenant_id", "kind", "name");
CREATE INDEX "payment_options_tenant_id_kind_sort_order_idx"
  ON "payment_options" ("tenant_id", "kind", "sort_order");

ALTER TABLE "payment_options"
  ADD CONSTRAINT "payment_options_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_options" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "payment_options" FROM anon, authenticated;

-- ── 2. Soggetto anagrafico canonico ──────────────────────────────────────────

CREATE TABLE "parties" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "company_name" TEXT,
  "first_name" TEXT,
  "last_name" TEXT,
  "vat_number" TEXT,
  "tax_code" TEXT,
  "email" TEXT,
  "pec" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "contact_name" TEXT,
  "address_line1" TEXT,
  "address_line2" TEXT,
  "city" TEXT,
  "province" TEXT,
  "postal_code" TEXT,
  "country_code" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parties_tenant_id_idx" ON "parties" ("tenant_id");
CREATE INDEX "parties_tenant_id_company_name_idx" ON "parties" ("tenant_id", "company_name");
CREATE INDEX "parties_tenant_id_last_name_first_name_idx"
  ON "parties" ("tenant_id", "last_name", "first_name");

ALTER TABLE "parties"
  ADD CONSTRAINT "parties_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parties" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "parties" FROM anon, authenticated;

-- ── 3. Copie di sicurezza pre-migrazione ─────────────────────────────────────

CREATE TABLE "_backup_customers_pre_party" AS TABLE "customers";
CREATE TABLE "_backup_suppliers_pre_party" AS TABLE "suppliers";
ALTER TABLE "_backup_customers_pre_party" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_backup_suppliers_pre_party" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "_backup_customers_pre_party" FROM anon, authenticated;
REVOKE ALL ON "_backup_suppliers_pre_party" FROM anon, authenticated;

-- ── 4. Nuove colonne di ruolo ────────────────────────────────────────────────

ALTER TABLE "customers"
  ADD COLUMN "party_id" UUID,
  ADD COLUMN "code" TEXT,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "payment_method" TEXT,
  ADD COLUMN "transport_responsible" TEXT,
  ADD COLUMN "document_creation_alert" TEXT,
  ADD COLUMN "document_creation_note" TEXT,
  ADD COLUMN "_new_party_id" UUID;

-- L'attuale document_creation_note fornitore era semanticamente un avviso
-- ("Avviso mostrato in creazione arrivo merce"): diventa document_creation_alert.
ALTER TABLE "suppliers" RENAME COLUMN "document_creation_note" TO "document_creation_alert";

ALTER TABLE "suppliers"
  ADD COLUMN "party_id" UUID,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "payment_method" TEXT,
  ADD COLUMN "document_creation_note" TEXT,
  ADD COLUMN "_new_party_id" UUID;

-- ── 5. Backfill soggetti ─────────────────────────────────────────────────────

-- 5a. Un id soggetto per ogni cliente; il fornitore collegato (ruolo duale)
--     condivide lo stesso soggetto invece di restare un'anagrafica duplicata.
UPDATE "customers" SET "_new_party_id" = gen_random_uuid();

UPDATE "suppliers" s
SET "_new_party_id" = c."_new_party_id"
FROM "customers" c
WHERE c."linked_supplier_id" = s."id" AND c."tenant_id" = s."tenant_id";

UPDATE "suppliers" SET "_new_party_id" = gen_random_uuid()
WHERE "_new_party_id" IS NULL;

-- 5b. Soggetti dai clienti (per le coppie duali si integrano i campi che
--     l'anagrafica cliente non aveva: codice fiscale, PEC, sito, referente).
INSERT INTO "parties" (
  "id", "tenant_id", "company_name", "first_name", "last_name",
  "vat_number", "tax_code", "email", "pec", "phone", "website", "contact_name",
  "address_line1", "address_line2", "city", "province", "postal_code", "country_code",
  "notes", "created_at", "updated_at"
)
SELECT
  c."_new_party_id",
  c."tenant_id",
  COALESCE(NULLIF(TRIM(c."company_name"), ''), NULLIF(TRIM(s."name"), '')),
  NULLIF(TRIM(c."first_name"), ''),
  NULLIF(TRIM(c."last_name"), ''),
  COALESCE(NULLIF(TRIM(c."vat_number"), ''), NULLIF(TRIM(s."vat_number"), '')),
  NULLIF(TRIM(s."tax_code"), ''),
  COALESCE(NULLIF(TRIM(c."email"), ''), NULLIF(TRIM(s."email"), '')),
  NULLIF(TRIM(s."pec"), ''),
  COALESCE(NULLIF(TRIM(c."phone"), ''), NULLIF(TRIM(s."phone"), '')),
  NULLIF(TRIM(s."website"), ''),
  NULLIF(TRIM(s."contact_name"), ''),
  COALESCE(c."address_line1", s."address_line1"),
  COALESCE(c."address_line2", s."address_line2"),
  COALESCE(c."city", s."city"),
  COALESCE(c."province", s."province"),
  COALESCE(c."postal_code", s."postal_code"),
  COALESCE(c."country_code", s."country_code"),
  COALESCE(NULLIF(TRIM(c."notes"), ''), NULLIF(TRIM(s."notes"), '')),
  c."created_at",
  CURRENT_TIMESTAMP
FROM "customers" c
LEFT JOIN "suppliers" s ON s."id" = c."linked_supplier_id";

-- 5c. Soggetti dai fornitori senza ruolo cliente collegato.
INSERT INTO "parties" (
  "id", "tenant_id", "company_name", "first_name", "last_name",
  "vat_number", "tax_code", "email", "pec", "phone", "website", "contact_name",
  "address_line1", "address_line2", "city", "province", "postal_code", "country_code",
  "notes", "created_at", "updated_at"
)
SELECT
  s."_new_party_id",
  s."tenant_id",
  NULLIF(TRIM(s."name"), ''),
  NULL,
  NULL,
  NULLIF(TRIM(s."vat_number"), ''),
  NULLIF(TRIM(s."tax_code"), ''),
  NULLIF(TRIM(s."email"), ''),
  NULLIF(TRIM(s."pec"), ''),
  NULLIF(TRIM(s."phone"), ''),
  NULLIF(TRIM(s."website"), ''),
  NULLIF(TRIM(s."contact_name"), ''),
  s."address_line1", s."address_line2", s."city", s."province",
  s."postal_code", s."country_code",
  NULLIF(TRIM(s."notes"), ''),
  s."created_at",
  CURRENT_TIMESTAMP
FROM "suppliers" s
WHERE NOT EXISTS (
  SELECT 1 FROM "customers" c WHERE c."linked_supplier_id" = s."id"
);

-- 5d. Aggancio ruoli → soggetto.
UPDATE "customers" SET "party_id" = "_new_party_id";
UPDATE "suppliers" SET "party_id" = "_new_party_id";

ALTER TABLE "customers" ALTER COLUMN "party_id" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "party_id" SET NOT NULL;
ALTER TABLE "customers" DROP COLUMN "_new_party_id";
ALTER TABLE "suppliers" DROP COLUMN "_new_party_id";

-- ── 6. Codice cliente progressivo (per tenant, ordine di creazione) ──────────

UPDATE "customers" c
SET "code" = ranked."code"
FROM (
  SELECT "id",
    LPAD((ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id"))::TEXT, 4, '0') AS "code"
  FROM "customers"
) ranked
WHERE ranked."id" = c."id";

-- ── 7. Vincoli e indici nuovi ────────────────────────────────────────────────

CREATE UNIQUE INDEX "customers_party_id_key" ON "customers" ("party_id");
CREATE UNIQUE INDEX "suppliers_party_id_key" ON "suppliers" ("party_id");
CREATE UNIQUE INDEX "customers_tenant_id_code_key" ON "customers" ("tenant_id", "code");
CREATE INDEX "customers_tenant_id_idx" ON "customers" ("tenant_id");

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_party_id_fkey"
  FOREIGN KEY ("party_id") REFERENCES "parties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_party_id_fkey"
  FOREIGN KEY ("party_id") REFERENCES "parties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 8. Rimozione dati comuni duplicati dai ruoli ─────────────────────────────

ALTER TABLE "customers" DROP CONSTRAINT "customers_linked_supplier_id_fkey";
DROP INDEX "customers_linked_supplier_id_key";
DROP INDEX "customers_tenant_id_last_name_idx";
DROP INDEX "suppliers_tenant_id_name_idx";

ALTER TABLE "customers"
  DROP COLUMN "first_name",
  DROP COLUMN "last_name",
  DROP COLUMN "email",
  DROP COLUMN "phone",
  DROP COLUMN "notes",
  DROP COLUMN "address_line1",
  DROP COLUMN "address_line2",
  DROP COLUMN "city",
  DROP COLUMN "province",
  DROP COLUMN "postal_code",
  DROP COLUMN "country_code",
  DROP COLUMN "company_name",
  DROP COLUMN "vat_number",
  DROP COLUMN "linked_supplier_id";

ALTER TABLE "suppliers"
  DROP COLUMN "name",
  DROP COLUMN "vat_number",
  DROP COLUMN "tax_code",
  DROP COLUMN "email",
  DROP COLUMN "pec",
  DROP COLUMN "phone",
  DROP COLUMN "contact_name",
  DROP COLUMN "website",
  DROP COLUMN "address_line1",
  DROP COLUMN "address_line2",
  DROP COLUMN "city",
  DROP COLUMN "province",
  DROP COLUMN "postal_code",
  DROP COLUMN "country_code",
  DROP COLUMN "notes";
