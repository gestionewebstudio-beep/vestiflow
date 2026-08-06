-- Sede operativa predefinita per utente (specifica cliente): SUGGERIMENTO nei
-- form, mai fallback automatico. Deve essere una sede autorizzata per l'utente;
-- l'applicativo la azzera quando l'assegnazione sedi cambia e non e' piu'
-- autorizzata. Se la location viene eliminata, il riferimento si azzera (SET NULL).
ALTER TABLE "users" ADD COLUMN "default_location_id" UUID;

ALTER TABLE "users"
  ADD CONSTRAINT "users_default_location_id_fkey"
  FOREIGN KEY ("default_location_id") REFERENCES "locations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
