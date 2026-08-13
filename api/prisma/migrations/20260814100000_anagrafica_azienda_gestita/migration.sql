-- L'anagrafica dell'AZIENDA GESTITA dal cliente: quella che intesta documenti,
-- stampe e XML, e che compila il titolare dalla sua maschera.
--
-- Perché una tabella nuova e non altre colonne su `tenants`. I campi anagrafici
-- già presenti su `tenants` sono **un altro dato**: li inserisce l'admin di
-- piattaforma quando attiva il cliente e dicono a chi è intestato il contratto
-- VestiFlow. Sono serviti finora come ripiego per intestare le stampe, ma le due
-- cose divergono appena il cliente decide di gestire nel gestionale un'azienda
-- diversa da quella con cui ha firmato — ed è una decisione sua, che non deve
-- passare da noi.
--
-- Riusare le stesse colonne significherebbe che il titolare, correggendo il
-- proprio indirizzo, riscrive il record commerciale del cliente. Separarle
-- costa una tabella e chiude la questione.
--
-- Nessun travaso di dati qui dentro, di proposito: la precompilazione dai dati
-- di attivazione è un pulsante nella maschera, che il titolare preme dopo aver
-- visto cosa entra. Un UPDATE silenzioso in migration farebbe la stessa cosa
-- senza che nessuno l'abbia scelta, e non si distinguerebbe più il campo
-- confermato da quello ereditato.

CREATE TABLE "company_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_name" TEXT,
    "vat_number" TEXT,
    "fiscal_code" TEXT,
    "phone" TEXT,
    "pec" TEXT,
    "sdi_code" TEXT,
    "iban" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postal_code" TEXT,
    "country_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- Una sola azienda per tenant (decisione di prodotto 08/2026): due aziende
-- sullo stesso magazzino aprirebbero la domanda «di chi è questa giacenza».
CREATE UNIQUE INDEX "company_profiles_tenant_id_key" ON "company_profiles"("tenant_id");

ALTER TABLE "company_profiles"
    ADD CONSTRAINT "company_profiles_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS come per tutte le altre tabelle (0003_enable_rls): abilitata senza policy
-- = default deny per anon/authenticated della Data API pubblica. Prisma si
-- connette come owner e continua a bypassare RLS: l'API NestJS non cambia.
-- `scripts/check-rls.mjs` fa fallire la build se questa parte manca.
ALTER TABLE "company_profiles" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "company_profiles" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "company_profiles" FROM authenticated;
  END IF;
END
$$;
