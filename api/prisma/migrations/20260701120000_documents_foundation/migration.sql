-- Fondamenta documentali (§2 piano funzionale): tipi documento, stati, numeratori
-- configurabili per tenant, testata documento e righe. Ordine fornitore e
-- inventario mantengono i modelli dedicati storici: il dominio documentale li
-- affianca e potrà assorbirli negli step successivi.

CREATE TYPE "DocumentType" AS ENUM (
    'supplier_order',
    'goods_receipt',
    'supplier_ddt',
    'supplier_invoice_accompanying',
    'supplier_invoice',
    'sales_ddt',
    'transfer',
    'manual_unload',
    'adjustment',
    'inventory',
    'proforma',
    'invoice_draft'
);

CREATE TYPE "DocumentStatus" AS ENUM (
    'draft',
    'confirmed',
    'printed',
    'sent',
    'externally_registered',
    'cancelled'
);

-- ── Configurazione per tipo documento (documenti abilitati, serie, numerazione) ──
CREATE TABLE "document_type_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "print_title" TEXT,
    "auto_numbering" BOOLEAN NOT NULL DEFAULT true,
    "number_prefix" TEXT,
    "default_series" TEXT NOT NULL DEFAULT 'A',
    "block_after_confirm" BOOLEAN NOT NULL DEFAULT false,
    "prices_include_vat" BOOLEAN NOT NULL DEFAULT false,
    "default_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_type_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_type_settings_tenant_id_type_key"
    ON "document_type_settings"("tenant_id", "type");
CREATE INDEX "document_type_settings_tenant_id_idx"
    ON "document_type_settings"("tenant_id");

-- ── Numeratori progressivi per (tenant, tipo, serie, anno) ──
CREATE TABLE "document_sequences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "series" TEXT NOT NULL DEFAULT 'A',
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_sequences_tenant_id_type_series_year_key"
    ON "document_sequences"("tenant_id", "type", "series", "year");
CREATE INDEX "document_sequences_tenant_id_idx"
    ON "document_sequences"("tenant_id");

-- ── Testata documento ──
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'draft',
    "series" TEXT NOT NULL DEFAULT 'A',
    "number" INTEGER,
    "year" INTEGER NOT NULL,
    "reference" TEXT,
    "document_date" TIMESTAMP(3) NOT NULL,
    "registration_date" TIMESTAMP(3),
    "print_title" TEXT,
    "notes" TEXT,
    "internal_comment" TEXT,
    "supplier_id" UUID,
    "supplier_name" TEXT,
    "customer_id" UUID,
    "customer_name" TEXT,
    "location_id" UUID,
    "target_location_id" UUID,
    "external_doc_number" TEXT,
    "external_doc_date" TIMESTAMP(3),
    "external_ref" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
    "tax_minor" INTEGER NOT NULL DEFAULT 0,
    "total_minor" INTEGER NOT NULL DEFAULT 0,
    "prices_include_vat" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "documents_tenant_id_type_series_year_number_key"
    ON "documents"("tenant_id", "type", "series", "year", "number");
CREATE INDEX "documents_tenant_id_type_status_idx"
    ON "documents"("tenant_id", "type", "status");
CREATE INDEX "documents_tenant_id_status_idx"
    ON "documents"("tenant_id", "status");
CREATE INDEX "documents_tenant_id_document_date_idx"
    ON "documents"("tenant_id", "document_date" DESC);

-- ── Righe documento ──
CREATE TABLE "document_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "variant_id" UUID,
    "sku" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_price_minor" INTEGER NOT NULL DEFAULT 0,
    "discount_percent" INTEGER NOT NULL DEFAULT 0,
    "vat_rate_percent" INTEGER,
    "line_total_minor" INTEGER NOT NULL DEFAULT 0,
    "loads_stock" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_lines_document_id_idx" ON "document_lines"("document_id");
CREATE INDEX "document_lines_tenant_id_idx" ON "document_lines"("tenant_id");

-- ── Foreign keys ──
ALTER TABLE "document_type_settings"
    ADD CONSTRAINT "document_type_settings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_sequences"
    ADD CONSTRAINT "document_sequences_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_target_location_id_fkey"
    FOREIGN KEY ("target_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_lines"
    ADD CONSTRAINT "document_lines_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_lines"
    ADD CONSTRAINT "document_lines_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_lines"
    ADD CONSTRAINT "document_lines_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Row Level Security: default deny per la Data API pubblica (vedi 0003_enable_rls) ──
ALTER TABLE "document_type_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_lines" ENABLE ROW LEVEL SECURITY;
