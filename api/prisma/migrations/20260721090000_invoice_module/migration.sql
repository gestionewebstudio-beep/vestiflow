-- Modulo Fattura: la ex «Bozza fattura» diventa Fattura fiscale e affianca la
-- Fattura accompagnatoria (stesso numeratore, stesso form base, sezioni
-- trasporto/destinazione e scarico magazzino solo sull'accompagnatoria).

-- Nuovo tipo documento. Condivide il numeratore con `invoice_draft`: la
-- mappatura vive in `documentNumberingType` (document-type.util.ts), non qui,
-- così `DocumentSequence` continua a chiavare su un unico tipo per gruppo.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'invoice_accompanying';

-- Cedente: IBAN del negozio per i dati pagamento in fattura e DatiPagamento XML.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "iban" TEXT;

-- Cessionario: codice destinatario SDI del soggetto (alternativo alla PEC).
ALTER TABLE "parties" ADD COLUMN IF NOT EXISTS "sdi_code" TEXT;

-- Dati pagamento in testata fattura.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "payment_due_date" DATE;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "iban" TEXT;

-- Aggancio Fattura ↔ DDT vendita (1:N, opzionale, solo documentale).
CREATE TABLE IF NOT EXISTS "invoice_sales_ddt_links" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"    UUID         NOT NULL,
    "invoice_id"   UUID         NOT NULL,
    "sales_ddt_id" UUID         NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_sales_ddt_links_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "invoice_sales_ddt_links"
    ADD CONSTRAINT "invoice_sales_ddt_links_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_sales_ddt_links"
    ADD CONSTRAINT "invoice_sales_ddt_links_sales_ddt_id_fkey"
    FOREIGN KEY ("sales_ddt_id") REFERENCES "documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_sales_ddt_links_invoice_id_sales_ddt_id_key"
    ON "invoice_sales_ddt_links"("invoice_id", "sales_ddt_id");
CREATE INDEX IF NOT EXISTS "invoice_sales_ddt_links_tenant_id_invoice_id_idx"
    ON "invoice_sales_ddt_links"("tenant_id", "invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_sales_ddt_links_tenant_id_sales_ddt_id_idx"
    ON "invoice_sales_ddt_links"("tenant_id", "sales_ddt_id");
