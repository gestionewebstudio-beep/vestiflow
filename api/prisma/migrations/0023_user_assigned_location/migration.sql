-- Sede operativa fissa per manager/commesso (titolare/admin: null = tutte le sedi attive).

ALTER TABLE "users"
  ADD COLUMN "assigned_location_id" UUID;

ALTER TABLE "users"
  ADD CONSTRAINT "users_assigned_location_id_fkey"
  FOREIGN KEY ("assigned_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_assigned_location_id_idx" ON "users"("assigned_location_id");
