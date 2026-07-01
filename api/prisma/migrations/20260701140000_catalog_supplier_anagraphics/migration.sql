-- Step 3: anagrafica articoli e fornitori completa (UOM, IVA, tracking, link fornitore-variante)

CREATE TYPE "InventoryTrackingMode" AS ENUM ('none', 'standard', 'lot', 'serial');

ALTER TABLE "products"
    ADD COLUMN "unit_of_measure" TEXT NOT NULL DEFAULT 'pz',
    ADD COLUMN "default_vat_rate_percent" INTEGER,
    ADD COLUMN "inventory_tracking" "InventoryTrackingMode" NOT NULL DEFAULT 'standard',
    ADD COLUMN "manages_stock" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "suppliers"
    ADD COLUMN "code" TEXT,
    ADD COLUMN "vat_number" TEXT,
    ADD COLUMN "tax_code" TEXT,
    ADD COLUMN "pec" TEXT,
    ADD COLUMN "contact_name" TEXT,
    ADD COLUMN "website" TEXT,
    ADD COLUMN "address_line1" TEXT,
    ADD COLUMN "address_line2" TEXT,
    ADD COLUMN "city" TEXT,
    ADD COLUMN "province" TEXT,
    ADD COLUMN "postal_code" TEXT,
    ADD COLUMN "country_code" TEXT,
    ADD COLUMN "payment_terms" TEXT;

CREATE UNIQUE INDEX "suppliers_tenant_id_code_key" ON "suppliers"("tenant_id", "code");
CREATE INDEX "suppliers_tenant_id_name_idx" ON "suppliers"("tenant_id", "name");

CREATE TABLE "supplier_variant_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "supplier_sku" TEXT,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "last_purchase_price_minor" INTEGER,
    "min_order_quantity" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_variant_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_variant_links_tenant_id_supplier_id_variant_id_key"
    ON "supplier_variant_links"("tenant_id", "supplier_id", "variant_id");
CREATE INDEX "supplier_variant_links_tenant_id_variant_id_idx"
    ON "supplier_variant_links"("tenant_id", "variant_id");
CREATE INDEX "supplier_variant_links_tenant_id_supplier_id_idx"
    ON "supplier_variant_links"("tenant_id", "supplier_id");

ALTER TABLE "supplier_variant_links"
    ADD CONSTRAINT "supplier_variant_links_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_variant_links"
    ADD CONSTRAINT "supplier_variant_links_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_variant_links"
    ADD CONSTRAINT "supplier_variant_links_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_variant_links" ENABLE ROW LEVEL SECURITY;
