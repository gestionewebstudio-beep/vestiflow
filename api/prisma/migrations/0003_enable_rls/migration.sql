-- Sicurezza multi-tenant: abilita Row Level Security su tutte le tabelle di business.
--
-- Perche': la anon/publishable key Supabase e' pubblica (nel bundle JS). Senza RLS,
-- la Data API (PostgREST) esporrebbe i dati di TUTTI i tenant a chiunque possieda
-- la chiave, scavalcando l'API NestJS e il filtro tenantId.
--
-- Con RLS abilitata e NESSUNA policy: i ruoli `anon`/`authenticated` (PostgREST) non
-- hanno accesso (default deny). Prisma si connette come owner del DB (bypassa RLS),
-- quindi l'API NestJS continua a funzionare. Non usiamo FORCE per non bloccare l'owner.

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopify_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopify_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopify_oauth_states" ENABLE ROW LEVEL SECURITY;

-- Difesa in profondita': revoca ogni privilegio ai ruoli pubblici PostgREST,
-- se presenti (ambiente Supabase). Idempotente e sicuro su Postgres non-Supabase.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
  END IF;
END
$$;
