-- Sostituisce l'assegnazione singola (users.assigned_location_id) con un modello
-- N-a-N: tabella ponte user_locations + flag has_all_locations_access.

-- 1) Tabella ponte utente -> location autorizzate
CREATE TABLE "user_locations" (
    "user_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_locations_pkey" PRIMARY KEY ("user_id","location_id")
);

CREATE INDEX "user_locations_tenant_id_idx" ON "user_locations"("tenant_id");
CREATE INDEX "user_locations_location_id_idx" ON "user_locations"("location_id");

ALTER TABLE "user_locations"
  ADD CONSTRAINT "user_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_locations"
  ADD CONSTRAINT "user_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Flag "accesso a tutte le sedi del tenant" (sostituisce assignedLocationId = null)
ALTER TABLE "users" ADD COLUMN "has_all_locations_access" BOOLEAN NOT NULL DEFAULT false;

-- 3) Backfill: owner/admin avevano accesso pieno implicito -> lo rendiamo esplicito
UPDATE "users" SET "has_all_locations_access" = true WHERE "role" IN ('owner', 'admin');

-- 4) Backfill: utenti vincolati con una sede assegnata -> riga user_locations equivalente
INSERT INTO "user_locations" ("user_id", "location_id", "tenant_id", "created_at")
SELECT "id", "assigned_location_id", "tenant_id", CURRENT_TIMESTAMP
FROM "users"
WHERE "assigned_location_id" IS NOT NULL;

-- 5) Rimozione del vecchio vincolo singolo, superato dal modello N-location
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_assigned_location_id_fkey";
DROP INDEX IF EXISTS "users_assigned_location_id_idx";
ALTER TABLE "users" DROP COLUMN "assigned_location_id";
