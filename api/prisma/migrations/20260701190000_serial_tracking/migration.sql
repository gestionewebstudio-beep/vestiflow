-- Tracciamento seriali (C6 residuo): numeri seriali su righe documento + anagrafica seriali.

CREATE TYPE "InventorySerialStatus" AS ENUM ('in_stock', 'consumed');

ALTER TABLE "document_lines"
    ADD COLUMN "serial_numbers" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "inventory_serials" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "status" "InventorySerialStatus" NOT NULL DEFAULT 'in_stock',
    "document_line_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_serials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_serials_tenant_id_serial_number_key"
    ON "inventory_serials"("tenant_id", "serial_number");

CREATE INDEX "inventory_serials_tenant_id_variant_id_location_id_idx"
    ON "inventory_serials"("tenant_id", "variant_id", "location_id");

CREATE INDEX "inventory_serials_document_line_id_idx"
    ON "inventory_serials"("document_line_id");

ALTER TABLE "inventory_serials"
    ADD CONSTRAINT "inventory_serials_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_serials"
    ADD CONSTRAINT "inventory_serials_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_serials"
    ADD CONSTRAINT "inventory_serials_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_serials"
    ADD CONSTRAINT "inventory_serials_document_line_id_fkey"
    FOREIGN KEY ("document_line_id") REFERENCES "document_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_serials" ENABLE ROW LEVEL SECURITY;
