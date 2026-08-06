-- Blocco selezione sedi attive post-primo salvataggio cliente + sblocco one-shot admin.

ALTER TABLE "tenants"
  ADD COLUMN "location_selection_locked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "location_selection_change_granted" BOOLEAN NOT NULL DEFAULT false;

-- Tenant con sedi già attive: considera la selezione già effettuata e bloccata.
UPDATE "tenants" AS t
SET "location_selection_locked" = true
WHERE EXISTS (
  SELECT 1
  FROM "locations" AS l
  WHERE l."tenant_id" = t."id"
    AND l."licensed_in_vf" = true
);
