-- FASE 2 — Vendite online, scarico di magazzino e Corrispettivi.
-- Documento interno "Vendita online" (snapshot evasione ordine canale),
-- registro Corrispettivi interno collegato, nuovo tipo movimento online_sale,
-- nuovi valori DocumentType per numerazione/collegamento movimenti.

-- ── 1. Enum ──────────────────────────────────────────────────────────────────
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'online_sale';

ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'online_sale';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'corrispettivo';

CREATE TYPE "OnlineSaleInventoryStatus" AS ENUM ('unloaded', 'partially_unloaded', 'not_applied');

CREATE TYPE "CorrispettivoStatus" AS ENUM (
  'to_verify',
  'included',
  'excluded_invoiced',
  'adjusted',
  'refunded'
);

-- ── 2. Vendite online (testata) ──────────────────────────────────────────────
CREATE TABLE "online_sales" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "series" TEXT NOT NULL DEFAULT 'A',
  "number" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "channel" "SalesOrderSource" NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "order_number" TEXT NOT NULL,
  "external_order_id" TEXT NOT NULL,
  "external_fulfillment_id" TEXT,
  "dedupe_key" TEXT NOT NULL,
  "order_placed_at" TIMESTAMP(3) NOT NULL,
  "fulfilled_at" TIMESTAMP(3) NOT NULL,
  "customer_id" UUID,
  "customer_name" TEXT NOT NULL,
  "customer_address" TEXT,
  "location_id" UUID,
  "payment_status" "SalesOrderFinancialStatus" NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
  "discount_minor" INTEGER NOT NULL DEFAULT 0,
  "shipping_minor" INTEGER NOT NULL DEFAULT 0,
  "tax_minor" INTEGER NOT NULL DEFAULT 0,
  "total_minor" INTEGER NOT NULL DEFAULT 0,
  "inventory_status" "OnlineSaleInventoryStatus" NOT NULL,
  "refunded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "online_sales_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "online_sales"
  ADD CONSTRAINT "online_sales_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "online_sales_sales_order_id_fkey"
    FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "online_sales_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "online_sales_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "online_sales_sales_order_id_key" ON "online_sales" ("sales_order_id");
CREATE UNIQUE INDEX "online_sales_tenant_id_dedupe_key_key" ON "online_sales" ("tenant_id", "dedupe_key");
CREATE UNIQUE INDEX "online_sales_tenant_id_series_year_number_key"
  ON "online_sales" ("tenant_id", "series", "year", "number");
CREATE INDEX "online_sales_tenant_id_fulfilled_at_idx" ON "online_sales" ("tenant_id", "fulfilled_at" DESC);
CREATE INDEX "online_sales_tenant_id_channel_fulfilled_at_idx"
  ON "online_sales" ("tenant_id", "channel", "fulfilled_at" DESC);

ALTER TABLE "online_sales" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "online_sales" FROM anon, authenticated;

-- ── 3. Vendite online (righe) ────────────────────────────────────────────────
CREATE TABLE "online_sale_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "online_sale_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "variant_id" UUID,
  "sku" TEXT NOT NULL,
  "barcode" TEXT,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price_minor" INTEGER NOT NULL DEFAULT 0,
  "discount_minor" INTEGER NOT NULL DEFAULT 0,
  "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
  "vat_rate_percent" INTEGER,
  "tax_minor" INTEGER NOT NULL DEFAULT 0,
  "total_minor" INTEGER NOT NULL DEFAULT 0,
  "sales_order_line_id" UUID,
  "reservation_id" UUID,
  "location_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "online_sale_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "online_sale_lines"
  ADD CONSTRAINT "online_sale_lines_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "online_sale_lines_online_sale_id_fkey"
    FOREIGN KEY ("online_sale_id") REFERENCES "online_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "online_sale_lines_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "online_sale_lines_online_sale_id_idx" ON "online_sale_lines" ("online_sale_id");
CREATE INDEX "online_sale_lines_tenant_id_idx" ON "online_sale_lines" ("tenant_id");

ALTER TABLE "online_sale_lines" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "online_sale_lines" FROM anon, authenticated;

-- ── 4. Registro Corrispettivi (testata) ──────────────────────────────────────
CREATE TABLE "corrispettivo_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "series" TEXT NOT NULL DEFAULT 'A',
  "number" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "online_sale_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "channel" "SalesOrderSource" NOT NULL,
  "operational_date" TIMESTAMP(3) NOT NULL,
  "fiscal_date" DATE NOT NULL,
  "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
  "tax_minor" INTEGER NOT NULL DEFAULT 0,
  "total_minor" INTEGER NOT NULL DEFAULT 0,
  "discount_minor" INTEGER NOT NULL DEFAULT 0,
  "shipping_minor" INTEGER NOT NULL DEFAULT 0,
  "status" "CorrispettivoStatus" NOT NULL DEFAULT 'to_verify',
  "invoice_issued" BOOLEAN NOT NULL DEFAULT false,
  "excluded_from_summary" BOOLEAN NOT NULL DEFAULT false,
  "exclusion_reason" TEXT,
  "adjustment_note" TEXT,
  "refunded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corrispettivo_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "corrispettivo_entries"
  ADD CONSTRAINT "corrispettivo_entries_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "corrispettivo_entries_online_sale_id_fkey"
    FOREIGN KEY ("online_sale_id") REFERENCES "online_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "corrispettivo_entries_online_sale_id_key"
  ON "corrispettivo_entries" ("online_sale_id");
CREATE UNIQUE INDEX "corrispettivo_entries_tenant_id_series_year_number_key"
  ON "corrispettivo_entries" ("tenant_id", "series", "year", "number");
CREATE INDEX "corrispettivo_entries_tenant_id_fiscal_date_idx"
  ON "corrispettivo_entries" ("tenant_id", "fiscal_date" DESC);
CREATE INDEX "corrispettivo_entries_tenant_id_channel_fiscal_date_idx"
  ON "corrispettivo_entries" ("tenant_id", "channel", "fiscal_date" DESC);
CREATE INDEX "corrispettivo_entries_tenant_id_sales_order_id_idx"
  ON "corrispettivo_entries" ("tenant_id", "sales_order_id");

ALTER TABLE "corrispettivo_entries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "corrispettivo_entries" FROM anon, authenticated;

-- ── 5. Registro Corrispettivi (righe) ────────────────────────────────────────
CREATE TABLE "corrispettivo_entry_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "entry_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "is_shipping" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "discount_minor" INTEGER NOT NULL DEFAULT 0,
  "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
  "vat_rate_percent" INTEGER,
  "tax_minor" INTEGER NOT NULL DEFAULT 0,
  "total_minor" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corrispettivo_entry_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "corrispettivo_entry_lines"
  ADD CONSTRAINT "corrispettivo_entry_lines_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "corrispettivo_entry_lines_entry_id_fkey"
    FOREIGN KEY ("entry_id") REFERENCES "corrispettivo_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "corrispettivo_entry_lines_entry_id_idx" ON "corrispettivo_entry_lines" ("entry_id");
CREATE INDEX "corrispettivo_entry_lines_tenant_id_idx" ON "corrispettivo_entry_lines" ("tenant_id");

ALTER TABLE "corrispettivo_entry_lines" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "corrispettivo_entry_lines" FROM anon, authenticated;

-- ── 6. DDT collegato alla Vendita online (fase 2 §9) ─────────────────────────
-- Il DDT che riferisce una Vendita online già movimentata NON crea movimenti
-- né consuma impegni: il riferimento rende la regola verificabile.
ALTER TABLE "documents" ADD COLUMN "online_sale_id" UUID;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_online_sale_id_fkey"
    FOREIGN KEY ("online_sale_id") REFERENCES "online_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "documents_tenant_id_online_sale_id_idx" ON "documents" ("tenant_id", "online_sale_id");
