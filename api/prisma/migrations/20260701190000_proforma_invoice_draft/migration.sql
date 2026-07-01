-- Step 7: proforma e bozza fattura — collegamento conversioni e causale

ALTER TABLE "documents"
    ADD COLUMN "source_document_id" UUID,
    ADD COLUMN "billing_cause" TEXT;

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_source_document_id_fkey"
    FOREIGN KEY ("source_document_id") REFERENCES "documents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "documents_tenant_id_source_document_id_idx"
    ON "documents"("tenant_id", "source_document_id");
