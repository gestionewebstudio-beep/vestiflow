-- CreateIndex
CREATE INDEX "product_variants_tenant_id_shopify_inventory_item_id_idx" ON "product_variants"("tenant_id", "shopify_inventory_item_id");

-- CreateIndex
CREATE INDEX "product_variants_tenant_id_shopify_variant_id_idx" ON "product_variants"("tenant_id", "shopify_variant_id");

-- CreateIndex
CREATE INDEX "product_variants_tenant_id_tiktok_sku_id_idx" ON "product_variants"("tenant_id", "tiktok_sku_id");

-- CreateIndex
CREATE INDEX "locations_tenant_id_shopify_location_id_idx" ON "locations"("tenant_id", "shopify_location_id");
