-- B6: step intermedio emissione fattura esterna
ALTER TABLE "documents" ADD COLUMN "externally_issued_at" TIMESTAMPTZ;

-- C1: lotto su riga documento
ALTER TABLE "document_lines" ADD COLUMN "lot_code" TEXT;
ALTER TABLE "document_lines" ADD COLUMN "lot_expiry_date" DATE;

-- C6: collegamento conteggio → documento
ALTER TABLE "inventory_count_sessions" ADD COLUMN "document_id" UUID;
ALTER TABLE "inventory_count_sessions" ADD CONSTRAINT "inventory_count_sessions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "inventory_count_sessions_document_id_idx" ON "inventory_count_sessions"("document_id");

-- B4: allegati documento
CREATE TABLE "document_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "created_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_attachments_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "document_attachments_document_id_idx" ON "document_attachments"("document_id");
CREATE INDEX "document_attachments_tenant_id_idx" ON "document_attachments"("tenant_id");
ALTER TABLE "document_attachments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "document_attachments" FROM anon, authenticated;

-- C5: allegati fornitore
CREATE TABLE "supplier_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "created_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_attachments_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "supplier_attachments" ADD CONSTRAINT "supplier_attachments_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "supplier_attachments_supplier_id_idx" ON "supplier_attachments"("supplier_id");
CREATE INDEX "supplier_attachments_tenant_id_idx" ON "supplier_attachments"("tenant_id");
ALTER TABLE "supplier_attachments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "supplier_attachments" FROM anon, authenticated;

-- C1: lotti inventario
CREATE TABLE "inventory_lots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "lot_code" TEXT NOT NULL,
  "expiry_date" DATE,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_lots_tenant_variant_location_lot_key"
  ON "inventory_lots"("tenant_id", "variant_id", "location_id", "lot_code");
CREATE INDEX "inventory_lots_tenant_id_variant_id_idx" ON "inventory_lots"("tenant_id", "variant_id");
ALTER TABLE "inventory_lots" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "inventory_lots" FROM anon, authenticated;

-- C3: preferenze colonne utente
CREATE TABLE "user_table_view_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "view_id" TEXT NOT NULL,
  "state_json" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_table_view_preferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_table_view_preferences_tenant_user_view_key"
  ON "user_table_view_preferences"("tenant_id", "user_id", "view_id");
CREATE INDEX "user_table_view_preferences_tenant_id_user_id_idx"
  ON "user_table_view_preferences"("tenant_id", "user_id");
ALTER TABLE "user_table_view_preferences" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "user_table_view_preferences" FROM anon, authenticated;
