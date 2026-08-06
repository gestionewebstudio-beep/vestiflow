-- Stato sincronizzazione inventario Shopify per anti-loop e riconciliazione (fase 2 post-audit).
CREATE TABLE "shopify_inventory_sync_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "last_pushed_available" INTEGER,
    "last_pushed_at" TIMESTAMPTZ,
    "last_observed_shopify_available" INTEGER,
    "last_observed_at" TIMESTAMPTZ,
    "mismatch_detected" BOOLEAN NOT NULL DEFAULT false,
    "mismatch_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopify_inventory_sync_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopify_inventory_sync_states_tenant_variant_location_key"
    ON "shopify_inventory_sync_states"("tenant_id", "variant_id", "location_id");

CREATE INDEX "shopify_inventory_sync_states_tenant_mismatch_idx"
    ON "shopify_inventory_sync_states"("tenant_id", "mismatch_detected");

ALTER TABLE "shopify_inventory_sync_states" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_inventory_sync_states" FROM anon, authenticated;
