-- PlatformAuditLog — il registro UNICO delle operazioni (docs/DA-FARE §10.3).
--
-- ⭐ PERCHE' ESISTE. Un rifiuto che nessuno puo' leggere e' indistinguibile da
--    un articolo mai arrivato, e le colonne del cestino (`deleted_at`,
--    `deleted_by_id`, `deletion_reason`) si AZZERANO al ripristino: sono lo
--    stato del cestino, non un registro. Questa tabella e' la traccia che
--    sopravvive.
--
-- ⛔ E' UNA SOLA, per il cestino e per lo storico Shopify: non esiste una
--    versione «del cestino» e una «dello storico» da fondere dopo.
--
-- ⛔ NESSUNA CHIAVE ESTERNA, e non e' una dimenticanza. Il registro deve
--    sopravvivere alla cancellazione del tenant, e le tre forme possibili di
--    riferimento falliscono tutte:
--
--      obbligatoria, senza ON DELETE   -> RESTRICT: la cancellazione fallisce
--      ON DELETE CASCADE               -> la traccia sparisce col tenant
--      opzionale (default Prisma)      -> SET NULL: la riga resta, ma non dice
--                                         piu' QUALE cliente e' stato cancellato
--
--    L'ultima e' la peggiore, perche' non fallisce niente e non sparisce
--    niente. Tenant e attore vivono quindi come TESTO — la stessa forma gia'
--    scelta da `tenant_user_audit_logs` per attore e bersaglio.
--
-- ⛔ NESSUN `updated_at`: append-only per STRUTTURA, come
--    `cash_session_device_changes`. A tenere chiusa la superficie e' la guardia
--    statica `check:registro-append-only`, non un trigger: un trigger
--    `BEFORE TRUNCATE` romperebbe le fixture di integrazione, che scoprono le
--    tabelle da `pg_tables` e le troncano tutte.
--
-- ⚠️ QUESTA MIGRATION NON E' STATA APPLICATA AL DATABASE CONDIVISO. Collaudata
--    soltanto in locale con `npm run prisma:deploy:test`.

CREATE TYPE "PlatformAuditActor" AS ENUM ('utente', 'webhook', 'pull', 'push', 'backfill');

CREATE TYPE "PlatformAuditOperation" AS ENUM (
  'cestino_prodotto', 'ripristino_prodotto', 'cestino_variante', 'ripristino_variante'
);

CREATE TYPE "PlatformAuditOutcome" AS ENUM ('tentativo', 'riuscita', 'rifiutata', 'fallita');

CREATE TABLE "platform_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),

  -- ⭐ Lega il `tentativo` al suo esito: senza, sono due fatti che nessuno sa
  --    accoppiare.
  "correlation_id" UUID NOT NULL,

  -- Testo, non riferimento: vedi la nota in testa.
  "tenant_id" UUID NOT NULL,
  -- ⚠️ `NULL` finche' la fase 2 (docs/24 §8.5.8) non acquisisce lo `shop_gid`:
  --    oggi nessun percorso del gestionale lo conosce.
  "shop_gid" TEXT,

  "actor" "PlatformAuditActor" NOT NULL,
  -- Valorizzati solo quando l'attore e' una persona.
  "actor_user_id" UUID,
  "actor_name" TEXT,
  "actor_email" TEXT,

  "operation" "PlatformAuditOperation" NOT NULL,
  "outcome" "PlatformAuditOutcome" NOT NULL,

  "entity_id" UUID,
  "entity_label" TEXT,
  "remote_gid" TEXT,

  "reason" TEXT,
  -- ⛔ La regola che ha deciso, per NOME. Mai credenziali, mai il payload di un
  --    webhook: di quello si registra la correlazione, non il contenuto.
  "detail" TEXT,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id"),

  -- ⭐ Un attore `utente` porta un nome: una traccia che dice «una persona» e
  --    non dice quale non risponde alla domanda per cui il registro esiste.
  CONSTRAINT "platform_audit_logs_utente_ha_un_nome" CHECK (
    "actor" <> 'utente' OR "actor_name" IS NOT NULL
  ),
  -- ⭐ E un processo non ne ha uno: cosi' «chi» non diventa un campo libero in
  --    cui ognuno scrive quello che vuole.
  CONSTRAINT "platform_audit_logs_processo_senza_nome" CHECK (
    "actor" = 'utente' OR ("actor_user_id" IS NULL AND "actor_name" IS NULL AND "actor_email" IS NULL)
  ),
  -- ⭐ Un esito negativo dice PERCHE'. Un `tentativo` e una `riuscita` no: non
  --    c'e' niente da spiegare.
  CONSTRAINT "platform_audit_logs_negativo_motivato" CHECK (
    "outcome" NOT IN ('rifiutata', 'fallita') OR "detail" IS NOT NULL
  )
);

CREATE INDEX "platform_audit_logs_correlation_idx" ON "platform_audit_logs" ("correlation_id");
CREATE INDEX "platform_audit_logs_tenant_created_idx" ON "platform_audit_logs" ("tenant_id", "created_at");
CREATE INDEX "platform_audit_logs_entity_created_idx" ON "platform_audit_logs" ("entity_id", "created_at");

-- ⛔ RLS e REVOKE nella STESSA migration che crea la tabella
--    (`regole-sicurezza`): la anon key Supabase e' pubblica, e senza questo la
--    Data API esporrebbe il registro a chiunque la possieda.
ALTER TABLE "platform_audit_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "platform_audit_logs" FROM PUBLIC, anon, authenticated;
