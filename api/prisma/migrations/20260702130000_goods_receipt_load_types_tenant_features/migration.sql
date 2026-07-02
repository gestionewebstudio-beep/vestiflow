-- Tipi carico manuale/iniziale + impostazioni operative tenant (prompt arrivo merce §2, §16).

CREATE TYPE "SupplierPriceUpdatePolicy" AS ENUM ('always', 'ask', 'never');

ALTER TYPE "DocumentType" ADD VALUE 'manual_load';
ALTER TYPE "DocumentType" ADD VALUE 'initial_load';

CREATE TABLE "tenant_feature_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lots_enabled" BOOLEAN NOT NULL DEFAULT false,
    "serials_enabled" BOOLEAN NOT NULL DEFAULT false,
    "variants_enabled" BOOLEAN NOT NULL DEFAULT true,
    "barcode_scanner_enabled" BOOLEAN NOT NULL DEFAULT true,
    "supplier_orders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "goods_receipt_enabled" BOOLEAN NOT NULL DEFAULT true,
    "warehouse_valuation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "update_supplier_price_on_load" "SupplierPriceUpdatePolicy" NOT NULL DEFAULT 'ask',
    "allow_negative_inventory" BOOLEAN NOT NULL DEFAULT false,
    "warn_negative_inventory" BOOLEAN NOT NULL DEFAULT true,
    "block_negative_inventory" BOOLEAN NOT NULL DEFAULT false,
    "default_unit_of_measure" TEXT NOT NULL DEFAULT 'pz',
    "default_vat_rate_percent" INTEGER NOT NULL DEFAULT 22,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_feature_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_feature_settings_tenant_id_key"
    ON "tenant_feature_settings"("tenant_id");

ALTER TABLE "tenant_feature_settings"
    ADD CONSTRAINT "tenant_feature_settings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_feature_settings" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "tenant_feature_settings" FROM anon, authenticated;
