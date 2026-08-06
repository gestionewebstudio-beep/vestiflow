-- Limite location incluse nel contratto tenant + flag operatività per sede.
ALTER TABLE "tenants"
  ADD COLUMN "licensed_location_count" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "locations"
  ADD COLUMN "licensed_in_vf" BOOLEAN NOT NULL DEFAULT false;

-- Tenant esistenti: la prima location onboarding resta operativa.
UPDATE "locations" AS l
SET "licensed_in_vf" = true
FROM (
  SELECT DISTINCT ON ("tenant_id") "id", "tenant_id"
  FROM "locations"
  ORDER BY "tenant_id", "created_at" ASC
) AS first_loc
WHERE l."id" = first_loc."id";
