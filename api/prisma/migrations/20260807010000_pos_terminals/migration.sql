-- Tranche 3 del modulo cassa: anagrafica dei terminali di pagamento (POS)
-- per l'adempimento 2026 del collegamento logico POS ↔ strumento di
-- certificazione (Provv. AdE 424470/2025). L'associazione si fa SUL PORTALE
-- dall'esercente: qui si tracciano terminali, finestre e stato adempimento.

CREATE TABLE "pos_terminals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "acquirer_name" TEXT NOT NULL,
    "description" TEXT,
    "activated_at" DATE NOT NULL,
    "portal_linked_at" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_terminals_pkey" PRIMARY KEY ("id")
);

-- Un Terminal ID è unico nel tenant: è l'identità del terminale sul portale.
CREATE UNIQUE INDEX "pos_terminals_tenant_id_terminal_id_key" ON "pos_terminals"("tenant_id", "terminal_id");

CREATE INDEX "pos_terminals_tenant_id_idx" ON "pos_terminals"("tenant_id");

ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS come per tutte le tabelle (regole-sicurezza): default deny.
ALTER TABLE "pos_terminals" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "pos_terminals" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "pos_terminals" FROM authenticated;
  END IF;
END
$$;
