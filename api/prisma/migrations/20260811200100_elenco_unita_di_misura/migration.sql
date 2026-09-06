-- L'elenco delle unità di misura del tenant: un ELENCO DI SUGGERIMENTI, non
-- un'autorità referenziale.
--
-- La forma è quella di `payment_options`, non quella dei codici IVA, ed è una
-- scelta: un codice IVA è un oggetto composto che cambia i soldi (diciannove
-- colonne, snapshot JSON, chiave esterna con SET NULL), un'unità di misura è
-- una stringa. Sette colonne bastano.
--
-- **Nessuna chiave esterna dalle righe**, di proposito. Le righe e le
-- anagrafiche hanno sempre e solo la stringa: eliminare una voce di qui non
-- lascia orfani, non innesca cascate e non richiede il «disattiva invece di
-- cancella». Il valore sulla riga degrada a testo, che è esattamente ciò che
-- era. È anche il motivo per cui il testo libero può restare ammesso: la
-- tabella suggerisce, non obbliga.
--
-- Il confronto per nome è case-insensitive nel servizio; l'unicità qui è quella
-- esatta, come su `payment_options`.

CREATE TABLE "unit_of_measure_options" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_of_measure_options_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unit_of_measure_options_tenant_id_name_key"
    ON "unit_of_measure_options"("tenant_id", "name");

CREATE INDEX "unit_of_measure_options_tenant_id_sort_order_idx"
    ON "unit_of_measure_options"("tenant_id", "sort_order");

ALTER TABLE "unit_of_measure_options"
    ADD CONSTRAINT "unit_of_measure_options_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS come per tutte le altre tabelle (0003_enable_rls): abilitata senza policy
-- = default deny per anon/authenticated della Data API pubblica. Prisma si
-- connette come owner e continua a bypassare RLS: l'API NestJS non cambia.
-- `scripts/check-rls.mjs` fa fallire la build se questa parte manca.
ALTER TABLE "unit_of_measure_options" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "unit_of_measure_options" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "unit_of_measure_options" FROM authenticated;
  END IF;
END
$$;
