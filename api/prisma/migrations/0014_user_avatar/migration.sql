-- Foto profilo utente (URL pubblico + path storage per sostituzione/rimozione).
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_storage_path" TEXT;
