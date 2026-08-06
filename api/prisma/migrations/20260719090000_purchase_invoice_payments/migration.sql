-- Registrazione fattura fornitore: righe per aliquota, pagamento a scadenze e
-- residuo "Ancora da saldare" denormalizzato per lista e filtro Stato.

-- 1) Residuo da saldare sul documento (totale - scadenze saldate).
ALTER TABLE "documents" ADD COLUMN "outstanding_minor" INTEGER NOT NULL DEFAULT 0;

-- Backfill: le registrazioni esistenti non hanno scadenze -> tutto da saldare.
UPDATE "documents" SET "outstanding_minor" = "total_minor" WHERE "type" = 'supplier_invoice';

-- 2) Origine riga di registrazione fattura: 'vat_summary' (riepilogo automatico
-- per aliquota) o 'manual' (voce libera). Le righe storiche per-arrivo restano null.
ALTER TABLE "document_lines" ADD COLUMN "line_source" TEXT;

-- 3) Scadenze di pagamento della registrazione fattura.
CREATE TABLE "document_payment_installments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,
    "due_date" DATE NOT NULL,
    "amount_minor" INTEGER NOT NULL DEFAULT 0,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "settled_at" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_payment_installments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_payment_installments_document_id_idx"
  ON "document_payment_installments"("document_id");
CREATE INDEX "document_payment_installments_tenant_id_idx"
  ON "document_payment_installments"("tenant_id");

ALTER TABLE "document_payment_installments"
  ADD CONSTRAINT "document_payment_installments_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sicurezza: mai esposta alla Data API pubblica (stesso pattern delle altre tabelle).
ALTER TABLE "document_payment_installments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "document_payment_installments" FROM anon, authenticated;
