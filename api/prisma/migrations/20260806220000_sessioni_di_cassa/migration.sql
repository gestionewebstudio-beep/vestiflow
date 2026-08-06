-- Tranche 1.2 del modulo cassa: sessioni di cassa.
--
-- 1. cash_sessions — apertura con fondo dichiarato, chiusura con conteggio
--    per metodo; gli attesi si congelano alla chiusura (la differenza di
--    cassa è un fatto storico, non un ricalcolo).
-- 2. cash_session_movements — versamenti e prelievi di contante con causale
--    obbligatoria: il cassetto non cambia mai in silenzio.
-- 3. documents.cash_session_id — vendita/reso di negozio agganciati alla
--    sessione aperta della sede al momento della conferma.

CREATE TYPE "CashSessionStatus" AS ENUM ('open', 'closed');

CREATE TYPE "CashSessionMovementType" AS ENUM ('deposit', 'withdrawal');

-- ── cash_sessions ────────────────────────────────────────────────────────────

CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_by_id" UUID,
    "opened_by_name" TEXT NOT NULL,
    "opening_float_minor" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" UUID,
    "closed_by_name" TEXT,
    "notes" TEXT,
    "counted_cash_minor" INTEGER,
    "counted_card_minor" INTEGER,
    "counted_other_minor" INTEGER,
    "expected_cash_minor" INTEGER,
    "expected_card_minor" INTEGER,
    "expected_other_minor" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_sessions_tenant_id_location_id_status_idx" ON "cash_sessions"("tenant_id", "location_id", "status");

CREATE INDEX "cash_sessions_tenant_id_opened_at_idx" ON "cash_sessions"("tenant_id", "opened_at" DESC);

-- Una sola sessione APERTA per sede: l'indice parziale è il vero lucchetto,
-- il servizio si limita a tradurre la violazione in un errore leggibile.
CREATE UNIQUE INDEX "cash_sessions_open_per_location" ON "cash_sessions"("location_id") WHERE "status" = 'open';

ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La sessione è storico contabile: la sede non si elimina se ne ha (RESTRICT).
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── cash_session_movements ───────────────────────────────────────────────────

CREATE TABLE "cash_session_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "type" "CashSessionMovementType" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_session_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_session_movements_session_id_idx" ON "cash_session_movements"("session_id");

CREATE INDEX "cash_session_movements_tenant_id_idx" ON "cash_session_movements"("tenant_id");

ALTER TABLE "cash_session_movements" ADD CONSTRAINT "cash_session_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_session_movements" ADD CONSTRAINT "cash_session_movements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── documents.cash_session_id ────────────────────────────────────────────────

ALTER TABLE "documents" ADD COLUMN "cash_session_id" UUID;

CREATE INDEX "documents_tenant_id_cash_session_id_idx" ON "documents"("tenant_id", "cash_session_id");

-- Sessione eliminata (mai in pratica) → il documento resta, sganciato.
ALTER TABLE "documents" ADD CONSTRAINT "documents_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── RLS (regole-sicurezza: default deny sulla Data API pubblica) ─────────────

ALTER TABLE "cash_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_session_movements" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "cash_sessions" FROM anon;
    REVOKE ALL ON "cash_session_movements" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "cash_sessions" FROM authenticated;
    REVOKE ALL ON "cash_session_movements" FROM authenticated;
  END IF;
END
$$;
