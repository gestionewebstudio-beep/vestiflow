-- Bootstrap dei ruoli che le migration esistenti si aspettano di trovare.
--
-- ⛔ **Senza questo file la prima migration che revoca fallisce, e la storia si
--    ferma a metà.** Su Supabase i ruoli `anon` e `authenticated` ci sono di
--    serie; su un PostgreSQL normale non esistono, e `REVOKE ... FROM anon`
--    risponde «role "anon" does not exist».
--
-- ⭐ **Servono SOLO per ESISTERE.** Misurato sulle 141 migration: 60 istruzioni
--    che li nominano, e sono TUTTE `REVOKE`. Nessun `GRANT`, mai. Quindi niente
--    login, niente privilegi, niente password: due ruoli nudi bastano, e dare
--    loro qualcosa in più sarebbe concedere un accesso che DEV non concede.
--
--       30  REVOKE ALL ON "<tabella>" FROM anon, authenticated;
--       13  REVOKE ALL ON "<tabella>" FROM authenticated;
--       13  REVOKE ALL ON "<tabella>" FROM anon;
--        4  REVOKE ALL ON ALL {TABLES,SEQUENCES} IN SCHEMA public FROM ...
--
-- ⚠️ `service_role` NON serve: zero riferimenti nelle migration. E nemmeno gli
--    schemi `auth.` / `storage.`, le estensioni Supabase o `auth.uid()` —
--    misurati tutti a zero. Questa è l'UNICA dipendenza da Supabase in tutta la
--    storia delle migration, ed è per questo che un Postgres nudo basta.
--
-- ⛔ Le migration NON sono state modificate per far girare questo ambiente, e
--    non devono esserlo: è l'ambiente che si adegua a loro. Una migration
--    ritoccata «perché in locale non passa» smette di essere quella che è stata
--    applicata a DEV, e l'integrazione non proverebbe più niente.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
