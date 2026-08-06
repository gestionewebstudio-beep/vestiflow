-- Indici compositi per filtri dashboard/lista per location e movimenti per location+data.
CREATE INDEX "inventory_levels_tenant_id_location_id_idx" ON "inventory_levels"("tenant_id", "location_id");

CREATE INDEX "stock_movements_tenant_id_location_id_created_at_idx" ON "stock_movements"("tenant_id", "location_id", "created_at" DESC);
