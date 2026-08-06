-- Permessi granulari per utenti non-titolare (array di chiavi stringa).

ALTER TABLE "users"
  ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
