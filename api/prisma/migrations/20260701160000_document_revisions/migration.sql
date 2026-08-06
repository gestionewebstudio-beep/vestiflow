-- Step 4: storico modifiche documenti confermati

CREATE TABLE "document_revisions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "changed_by_id" UUID,
    "changed_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_revisions_document_id_revision_number_key"
    ON "document_revisions"("document_id", "revision_number");
CREATE INDEX "document_revisions_tenant_id_document_id_created_at_idx"
    ON "document_revisions"("tenant_id", "document_id", "created_at" DESC);

ALTER TABLE "document_revisions"
    ADD CONSTRAINT "document_revisions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_revisions"
    ADD CONSTRAINT "document_revisions_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_revisions" ENABLE ROW LEVEL SECURITY;
