-- Inventario fisico: sessioni di conteggio e righe snapshot per location.

CREATE TYPE "InventoryCountStatus" AS ENUM ('in_progress', 'review', 'completed', 'cancelled');

CREATE TABLE "inventory_count_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'in_progress',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_by_name" TEXT NOT NULL,

    CONSTRAINT "inventory_count_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_count_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "system_quantity" INTEGER NOT NULL,
    "counted_quantity" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_count_lines_session_id_variant_id_key"
    ON "inventory_count_lines"("session_id", "variant_id");
CREATE INDEX "inventory_count_lines_session_id_idx" ON "inventory_count_lines"("session_id");
CREATE INDEX "inventory_count_lines_tenant_id_idx" ON "inventory_count_lines"("tenant_id");
CREATE INDEX "inventory_count_sessions_tenant_id_status_idx"
    ON "inventory_count_sessions"("tenant_id", "status");
CREATE INDEX "inventory_count_sessions_tenant_id_created_at_idx"
    ON "inventory_count_sessions"("tenant_id", "created_at" DESC);

ALTER TABLE "inventory_count_sessions"
    ADD CONSTRAINT "inventory_count_sessions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_count_sessions"
    ADD CONSTRAINT "inventory_count_sessions_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_count_lines"
    ADD CONSTRAINT "inventory_count_lines_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_count_lines"
    ADD CONSTRAINT "inventory_count_lines_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "inventory_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_count_lines"
    ADD CONSTRAINT "inventory_count_lines_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_count_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_count_lines" ENABLE ROW LEVEL SECURITY;
