-- Rimedio all'avviso Supabase `rls_disabled_in_public`.
--
-- Tre tabelle sono state create senza la protezione applicata a tutte le altre
-- (vedi 0003_enable_rls): senza RLS la Data API pubblica (PostgREST) le
-- espone a chiunque possieda la anon/publishable key, che sta nel bundle JS.
--
--   user_locations         (20260714160000) → mappa utente ⇄ sedi autorizzate
--   catalog_categories     (20260719100000) → categorie catalogo per tenant
--   invoice_sales_ddt_links(20260721090000) → aggancio fatture ⇄ DDT vendita
--
-- RLS abilitata SENZA policy = default deny per anon/authenticated. Prisma si
-- connette come owner del DB e continua a bypassare RLS, quindi l'API NestJS
-- non cambia comportamento. Niente FORCE, per non bloccare l'owner.
-- Idempotente: si può rieseguire senza effetti.

ALTER TABLE "user_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_sales_ddt_links" ENABLE ROW LEVEL SECURITY;

-- Difesa in profondità: revoca esplicita ai ruoli PostgREST, se esistono
-- (assenti su Postgres non-Supabase, es. ambienti di sviluppo locali).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "user_locations" FROM anon;
    REVOKE ALL ON "catalog_categories" FROM anon;
    REVOKE ALL ON "invoice_sales_ddt_links" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "user_locations" FROM authenticated;
    REVOKE ALL ON "catalog_categories" FROM authenticated;
    REVOKE ALL ON "invoice_sales_ddt_links" FROM authenticated;
  END IF;
END
$$;
