-- Fondazioni del modulo cassa (Tranche 0 + multi-tender):
--
-- 1. store_sale_payments — pagamenti per metodo della Vendita in negozio
--    (multi-tender): una riga per metodo, importo LORDO, somma sempre pari al
--    totale documento. Backfill: una riga per ogni vendita esistente, dal
--    campo payment_method che il documento già porta.
-- 2. fiscal_devices — stampante fiscale RT configurata per sede. Finché una
--    sede non ne ha una abilitata, la cassa resta non fiscale come oggi.
-- 3. fiscal_receipts — documento commerciale della vendita/reso di cassa.
--    La tabella nasce ora (stati inclusi); a scriverla sarà il driver di
--    stampa della Tranche 2.

CREATE TYPE "FiscalDeviceBrand" AS ENUM ('epson', 'custom', 'rch', 'olivetti', 'other');

CREATE TYPE "FiscalReceiptStatus" AS ENUM ('pending', 'emitted', 'failed', 'cancelled');

-- ── store_sale_payments ──────────────────────────────────────────────────────

CREATE TABLE "store_sale_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,
    "method" TEXT NOT NULL,
    "method_note" TEXT,
    "amount_minor" INTEGER NOT NULL,
    "tendered_minor" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_sale_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "store_sale_payments_document_id_idx" ON "store_sale_payments"("document_id");

CREATE INDEX "store_sale_payments_tenant_id_idx" ON "store_sale_payments"("tenant_id");

ALTER TABLE "store_sale_payments" ADD CONSTRAINT "store_sale_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Documento eliminato → i suoi pagamenti spariscono (sono dettaglio del doc).
ALTER TABLE "store_sale_payments" ADD CONSTRAINT "store_sale_payments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── fiscal_devices ───────────────────────────────────────────────────────────

CREATE TABLE "fiscal_devices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "brand" "FiscalDeviceBrand" NOT NULL,
    "model" TEXT,
    "endpoint" TEXT NOT NULL,
    "serial_number" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_devices_pkey" PRIMARY KEY ("id")
);

-- Al più un dispositivo per sede: l'identità della configurazione è la location.
CREATE UNIQUE INDEX "fiscal_devices_location_id_key" ON "fiscal_devices"("location_id");

CREATE INDEX "fiscal_devices_tenant_id_idx" ON "fiscal_devices"("tenant_id");

ALTER TABLE "fiscal_devices" ADD CONSTRAINT "fiscal_devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Location eliminata → la sua configurazione dispositivo sparisce.
ALTER TABLE "fiscal_devices" ADD CONSTRAINT "fiscal_devices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── fiscal_receipts ──────────────────────────────────────────────────────────

CREATE TABLE "fiscal_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "device_id" UUID,
    "status" "FiscalReceiptStatus" NOT NULL DEFAULT 'pending',
    "serial_number" TEXT,
    "fiscal_number" TEXT,
    "issued_at" TIMESTAMP(3),
    "original_receipt_id" UUID,
    "error_message" TEXT,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_receipts_pkey" PRIMARY KEY ("id")
);

-- Un documento ha al più una ricevuta fiscale.
CREATE UNIQUE INDEX "fiscal_receipts_document_id_key" ON "fiscal_receipts"("document_id");

-- Coda «da fiscalizzare» per tenant: la cassa la interroga per stato.
CREATE INDEX "fiscal_receipts_tenant_id_status_idx" ON "fiscal_receipts"("tenant_id", "status");

ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dispositivo rimosso → la ricevuta resta (storico fiscale), senza device.
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "fiscal_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_original_receipt_id_fkey" FOREIGN KEY ("original_receipt_id") REFERENCES "fiscal_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── RLS (regole-sicurezza: default deny sulla Data API pubblica) ─────────────
-- Come per tutte le altre tabelle: RLS abilitata senza policy = nessun accesso
-- per anon/authenticated. Prisma si connette come owner e la bypassa.

ALTER TABLE "store_sale_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_receipts" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "store_sale_payments" FROM anon;
    REVOKE ALL ON "fiscal_devices" FROM anon;
    REVOKE ALL ON "fiscal_receipts" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "store_sale_payments" FROM authenticated;
    REVOKE ALL ON "fiscal_devices" FROM authenticated;
    REVOKE ALL ON "fiscal_receipts" FROM authenticated;
  END IF;
END
$$;

-- ── Backfill pagamenti ───────────────────────────────────────────────────────
-- Ogni Vendita in negozio esistente diventa una vendita a metodo unico: una
-- riga pagamento che copre l'intero totale. I resi non hanno payment_method e
-- restano fuori (il rimborso strutturato arriverà con la sua tranche).

INSERT INTO "store_sale_payments"
  ("id", "tenant_id", "document_id", "position", "method", "method_note", "amount_minor", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  d."tenant_id",
  d."id",
  1,
  d."payment_method",
  d."payment_method_note",
  d."total_minor",
  d."created_at",
  CURRENT_TIMESTAMP
FROM "documents" d
WHERE d."type" = 'store_sale'
  AND d."payment_method" IS NOT NULL;
