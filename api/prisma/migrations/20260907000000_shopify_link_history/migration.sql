-- Storico dei collegamenti Shopify — FASE 1: solo schema (docs/24 §8.5.1-§8.5.8).
--
-- ⛔ NESSUN BACKFILL. Le tabelle nascono vuote e NON sono ancora fonte canonica:
--    lo diventeranno quando il backfill sara' completo e verificato e i lettori
--    di push e pull saranno migrati (docs/24 §8.5.5). Le colonne legacy
--    `shopify_product_id` / `shopify_variant_id` / `shopify_inventory_item_id`
--    restano intatte come cache di compatibilita': questa migration non le
--    tocca, non le rinomina e non le rimuove.
--
-- ⚠️ `shop_gid` nasce NULLABLE, ed e' la ragione per cui il rilascio e' a fasi:
--    il valore non esiste nei dati locali e una migration non puo' chiederlo a
--    Shopify. Si acquisisce con un passo esplicito (fase 2); `NOT NULL` arriva
--    solo dopo la verifica (fase 5).
--
-- ⭐ Gli identificativi remoti sono GID COMPLETI, mai numerici: il GID porta il
--    TIPO della risorsa, quindi un `Product` non puo' finire in una colonna di
--    variante. Il vincolo e' un CHECK, non una convenzione.

-- ── Enum ────────────────────────────────────────────────────────────────────

CREATE TYPE "ShopifyLinkStatus" AS ENUM ('active', 'remotely_deleted', 'unlinked');

CREATE TYPE "ShopifyLinkCloseReason" AS ENUM (
  'remote_delete',
  'not_found',
  'operator',
  'shop_change'
);

-- ── Ausiliarie sulle tabelle esistenti ──────────────────────────────────────
-- Servono alle FK composite: senza, il database non puo' rifiutare un link il
-- cui prodotto appartiene a un altro tenant. Sono additive e non toccano dati.

CREATE UNIQUE INDEX "products_id_tenant_id_key" ON "products" ("id", "tenant_id");
CREATE UNIQUE INDEX "product_variants_id_tenant_id_key" ON "product_variants" ("id", "tenant_id");
CREATE UNIQUE INDEX "product_variants_id_product_id_key" ON "product_variants" ("id", "product_id");

-- ⭐ La quarta ausiliaria e' per le SEDI (docs/24 §1.13.3). Senza, la FK
--    composita col tenant sul collegamento di sede non e' nemmeno scrivibile, e
--    l'isolamento resterebbe affidato al servizio applicativo — cioe' proprio
--    cio' che §15.3 vieta. E' ridondante rispetto alla chiave primaria: non puo'
--    fallire e non tocca dati.
CREATE UNIQUE INDEX "locations_id_tenant_id_key" ON "locations" ("id", "tenant_id");

-- ── shopify_shops: identita' immutabile del negozio ─────────────────────────

CREATE TABLE "shopify_shops" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "shop_gid" TEXT,
  "myshopify_domain" TEXT,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "shopify_shops_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shopify_shops_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  -- Il GID e' del tipo giusto, o non entra. `NULL` e' ammesso finche' la fase 2
  -- non lo acquisisce.
  CONSTRAINT "shopify_shops_gid_forma" CHECK (
    "shop_gid" IS NULL OR "shop_gid" ~ '^gid://shopify/Shop/[0-9]+$'
  )
);

-- ⭐ Univoco GLOBALMENTE: lo stesso negozio non appartiene a due tenant insieme
--    (docs/24 §8.5.1). PostgreSQL non fa collidere i NULL, quindi le connessioni
--    non ancora acquisite convivono senza ostacolarsi.
CREATE UNIQUE INDEX "shopify_shops_shop_gid_key" ON "shopify_shops" ("shop_gid");
CREATE UNIQUE INDEX "shopify_shops_tenant_id_shop_gid_key" ON "shopify_shops" ("tenant_id", "shop_gid");
CREATE UNIQUE INDEX "shopify_shops_id_tenant_id_key" ON "shopify_shops" ("id", "tenant_id");

-- ⛔ RLS e revoche NELLA STESSA migration che crea la tabella: non deve esistere
--    una finestra, nemmeno di una migration, in cui una tabella applicativa e'
--    priva di protezione (regole-sicurezza).
ALTER TABLE "shopify_shops" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_shops" FROM PUBLIC, anon, authenticated;

-- ── shopify_product_links: storico dei collegamenti prodotto ────────────────

CREATE TABLE "shopify_product_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "shopify_product_gid" TEXT NOT NULL,
  "status" "ShopifyLinkStatus" NOT NULL DEFAULT 'active',
  "close_reason" "ShopifyLinkCloseReason",
  "superseded_by_link_id" UUID,
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "last_event_at" TIMESTAMP(3),
  "last_event_triggered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "shopify_product_links_pkey" PRIMARY KEY ("id"),

  -- Solo un GID di PRODOTTO: un `ProductVariant` qui viene rifiutato.
  CONSTRAINT "shopify_product_links_gid_forma" CHECK (
    "shopify_product_gid" ~ '^gid://shopify/Product/[0-9]+$'
  ),

  -- I cinque CHECK di stato vanno letti come UN GRUPPO (docs/24 §8.5.2).
  -- ⚠️ Il secondo non e' ridondante rispetto al terzo e al quarto: senza di lui
  --    un `close_reason` NULL renderebbe `IN (...)` uguale a NULL, e un CHECK
  --    fallisce solo su FALSE — il varco si chiude imponendo NOT NULL qui.
  CONSTRAINT "shopify_product_links_attivo_pulito" CHECK (
    "status" <> 'active' OR ("closed_at" IS NULL AND "close_reason" IS NULL)
  ),
  CONSTRAINT "shopify_product_links_chiuso_completo" CHECK (
    "status" = 'active' OR ("closed_at" IS NOT NULL AND "close_reason" IS NOT NULL)
  ),
  CONSTRAINT "shopify_product_links_causale_eliminato" CHECK (
    "status" <> 'remotely_deleted' OR "close_reason" IN ('remote_delete', 'not_found')
  ),
  CONSTRAINT "shopify_product_links_causale_scollegato" CHECK (
    "status" <> 'unlinked' OR "close_reason" IN ('operator', 'shop_change')
  ),
  -- ⚠️ Blocca l'auto-riferimento (A→A), NON un ciclo fra due righe (A→B, B→A):
  --    un CHECK di riga non puo' vedere un'altra riga. Quella garanzia resta
  --    applicativa (docs/24 §8.5.2).
  CONSTRAINT "shopify_product_links_successore_non_se_stesso" CHECK (
    "superseded_by_link_id" IS NULL OR "superseded_by_link_id" <> "id"
  )
);

-- Un id remoto compare UNA VOLTA SOLA, storico incluso: e' cio' che impedisce
-- di riusarlo dopo la chiusura e tiene risolvibili ordini e resi storici.
CREATE UNIQUE INDEX "shopify_product_links_shop_id_shopify_product_gid_key"
  ON "shopify_product_links" ("shop_id", "shopify_product_gid");
CREATE UNIQUE INDEX "shopify_product_links_id_product_id_shop_id_key"
  ON "shopify_product_links" ("id", "product_id", "shop_id");
CREATE INDEX "shopify_product_links_tenant_id_shopify_product_gid_idx"
  ON "shopify_product_links" ("tenant_id", "shopify_product_gid");
CREATE INDEX "shopify_product_links_tenant_id_product_id_status_idx"
  ON "shopify_product_links" ("tenant_id", "product_id", "status");

-- Garanzia 3 (docs/24 §8.5.2): un solo collegamento ATTIVO per prodotto
-- locale. Le garanzie 1-2 qui sopra impediscono di riusare un id remoto;
-- questa impedisce che un'entita' LOCALE abbia due collegamenti vivi
-- insieme — la stessa regola di §3.1 («un solo asse alla volta»), applicata
-- dal database invece che da un controllo applicativo.
--
-- ⭐ E' l'indice a decidere, quindi non c'e' race condition: due inserimenti
--    concorrenti che superassero entrambi un controllo di servizio si
--    bloccherebbero qui, e il secondo fallirebbe. Vale gia' sotto
--    l'isolamento di default di PostgreSQL, senza SERIALIZABLE ne' lock.
--
-- ⚠️ Prisma non sa esprimere un indice parziale: lo schema lo dichiara in un
--    commento sul modello, non come `@@unique`.
CREATE UNIQUE INDEX "shopify_product_links_product_attivo_key"
  ON "shopify_product_links" ("product_id")
  WHERE "status" = 'active';

ALTER TABLE "shopify_product_links"
  ADD CONSTRAINT "shopify_product_links_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- FK COMPOSITE: negozio e prodotto devono essere dello stesso tenant del link.
  ADD CONSTRAINT "shopify_product_links_shop_id_tenant_id_fkey" FOREIGN KEY ("shop_id", "tenant_id")
    REFERENCES "shopify_shops" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_product_links_product_id_tenant_id_fkey" FOREIGN KEY ("product_id", "tenant_id")
    REFERENCES "products" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Il successore appartiene allo STESSO prodotto e allo STESSO negozio.
  -- ⚠️ `RESTRICT` esplicito: mai SET NULL (perderebbe il legame in silenzio),
  --    mai CASCADE (propagherebbe una cancellazione lungo la catena).
  ADD CONSTRAINT "shopify_product_links_superseded_by_fkey"
    FOREIGN KEY ("superseded_by_link_id", "product_id", "shop_id")
    REFERENCES "shopify_product_links" ("id", "product_id", "shop_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "shopify_product_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_product_links" FROM PUBLIC, anon, authenticated;

-- ── shopify_variant_links: storico dei collegamenti variante ────────────────

CREATE TABLE "shopify_variant_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "product_link_id" UUID NOT NULL,
  "shopify_variant_gid" TEXT NOT NULL,
  "shopify_inventory_item_gid" TEXT,
  "status" "ShopifyLinkStatus" NOT NULL DEFAULT 'active',
  "close_reason" "ShopifyLinkCloseReason",
  "superseded_by_link_id" UUID,
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "last_event_at" TIMESTAMP(3),
  "last_event_triggered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "shopify_variant_links_pkey" PRIMARY KEY ("id"),

  -- Due identificativi remoti, due tipi diversi, due CHECK distinti.
  CONSTRAINT "shopify_variant_links_gid_forma" CHECK (
    "shopify_variant_gid" ~ '^gid://shopify/ProductVariant/[0-9]+$'
  ),
  CONSTRAINT "shopify_variant_links_inventory_gid_forma" CHECK (
    "shopify_inventory_item_gid" IS NULL
    OR "shopify_inventory_item_gid" ~ '^gid://shopify/InventoryItem/[0-9]+$'
  ),

  CONSTRAINT "shopify_variant_links_attivo_pulito" CHECK (
    "status" <> 'active' OR ("closed_at" IS NULL AND "close_reason" IS NULL)
  ),
  CONSTRAINT "shopify_variant_links_chiuso_completo" CHECK (
    "status" = 'active' OR ("closed_at" IS NOT NULL AND "close_reason" IS NOT NULL)
  ),
  CONSTRAINT "shopify_variant_links_causale_eliminato" CHECK (
    "status" <> 'remotely_deleted' OR "close_reason" IN ('remote_delete', 'not_found')
  ),
  CONSTRAINT "shopify_variant_links_causale_scollegato" CHECK (
    "status" <> 'unlinked' OR "close_reason" IN ('operator', 'shop_change')
  ),
  CONSTRAINT "shopify_variant_links_successore_non_se_stesso" CHECK (
    "superseded_by_link_id" IS NULL OR "superseded_by_link_id" <> "id"
  )
);

CREATE UNIQUE INDEX "shopify_variant_links_shop_id_shopify_variant_gid_key"
  ON "shopify_variant_links" ("shop_id", "shopify_variant_gid");
CREATE UNIQUE INDEX "shopify_variant_links_shop_id_inventory_item_gid_key"
  ON "shopify_variant_links" ("shop_id", "shopify_inventory_item_gid");
CREATE UNIQUE INDEX "shopify_variant_links_id_variant_id_shop_id_key"
  ON "shopify_variant_links" ("id", "variant_id", "shop_id");
CREATE INDEX "shopify_variant_links_tenant_id_shopify_variant_gid_idx"
  ON "shopify_variant_links" ("tenant_id", "shopify_variant_gid");
CREATE INDEX "shopify_variant_links_tenant_id_variant_id_status_idx"
  ON "shopify_variant_links" ("tenant_id", "variant_id", "status");

-- Garanzia 4 (docs/24 §8.5.2): un solo collegamento ATTIVO per variante
-- locale. Vedi la garanzia 3 sulla tabella prodotto per il perche'.
CREATE UNIQUE INDEX "shopify_variant_links_variant_attivo_key"
  ON "shopify_variant_links" ("variant_id")
  WHERE "status" = 'active';

ALTER TABLE "shopify_variant_links"
  ADD CONSTRAINT "shopify_variant_links_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_variant_links_shop_id_tenant_id_fkey" FOREIGN KEY ("shop_id", "tenant_id")
    REFERENCES "shopify_shops" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- La variante appartiene al tenant del link…
  ADD CONSTRAINT "shopify_variant_links_variant_id_tenant_id_fkey" FOREIGN KEY ("variant_id", "tenant_id")
    REFERENCES "product_variants" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- …ed e' davvero figlia del prodotto dichiarato: e' il database a dirlo.
  ADD CONSTRAINT "shopify_variant_links_variant_id_product_id_fkey" FOREIGN KEY ("variant_id", "product_id")
    REFERENCES "product_variants" ("id", "product_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Il link del padre condivide prodotto e negozio: la chiusura a cascata
  -- (docs/24 §8.5.2, regola 8) diventa una UPDATE sola e verificabile.
  ADD CONSTRAINT "shopify_variant_links_product_link_fkey"
    FOREIGN KEY ("product_link_id", "product_id", "shop_id")
    REFERENCES "shopify_product_links" ("id", "product_id", "shop_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "shopify_variant_links_superseded_by_fkey"
    FOREIGN KEY ("superseded_by_link_id", "variant_id", "shop_id")
    REFERENCES "shopify_variant_links" ("id", "variant_id", "shop_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "shopify_variant_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_variant_links" FROM PUBLIC, anon, authenticated;

-- ── shopify_location_links: storico dei collegamenti di sede ────────────────
--
-- ⭐ Sede VestiFlow e location Shopify sono DUE ENTITA' AUTONOME (docs/24 §1.13):
--    la sincronizzazione avviene solo dove esiste un collegamento esplicito, e
--    quel collegamento lo dichiara una persona. Senza collegamento non succede
--    niente, in nessuna direzione.
--
-- ⛔ Questa tabella esiste per rendere distinguibili «il collegamento e' stato
--    chiuso» e «il collegamento non e' mai esistito» (§1.13.3). Senza, il
--    divieto di riaggancio automatico per nome o indirizzo e' sorretto solo da
--    un effetto collaterale — l'identificativo non viene azzerato — e una
--    location che tornasse con un id nuovo verrebbe riagganciata per nome.
--
-- ⚠️ Nessuna colonna di NOME o INDIRIZZO, ed e' deliberato: le anagrafiche non
--    si sincronizzano (§1.13.2), e un nome in questa tabella sarebbe l'appiglio
--    per il riaggancio automatico che la tabella esiste per impedire.
--
-- ⛔ Nessun `last_event_at` / `last_event_triggered_at`, al contrario delle due
--    tabelle sorelle. Quelle colonne servono a scartare eventi webhook fuori
--    ordine (§8.5.4), e per le location NON ESISTE alcun topic: gli otto
--    registrati sono inventory_levels, orders, customers e products
--    (`shopify-webhook-topics.ts`). Copiarle sarebbe inventare l'ordinamento di
--    eventi che non arrivano.

CREATE TABLE "shopify_location_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "shopify_location_gid" TEXT NOT NULL,
  "status" "ShopifyLinkStatus" NOT NULL DEFAULT 'active',
  "close_reason" "ShopifyLinkCloseReason",
  "superseded_by_link_id" UUID,
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "shopify_location_links_pkey" PRIMARY KEY ("id"),

  -- Solo un GID di LOCATION. La forma e' gia' quella usata dal codice di
  -- produzione (`shopify-location-id.util.ts`, `shopify-order-location.util.ts`):
  -- non e' una convenzione nuova, e qui la impone il database.
  CONSTRAINT "shopify_location_links_gid_forma" CHECK (
    "shopify_location_gid" ~ '^gid://shopify/Location/[0-9]+$'
  ),

  -- I cinque CHECK di stato, identici alle due tabelle sorelle e da leggere
  -- come UN GRUPPO: il secondo non e' ridondante rispetto al terzo e al quarto,
  -- perche' `IN (...)` su NULL vale NULL e un CHECK fallisce solo su FALSE.
  CONSTRAINT "shopify_location_links_attivo_pulito" CHECK (
    "status" <> 'active' OR ("closed_at" IS NULL AND "close_reason" IS NULL)
  ),
  CONSTRAINT "shopify_location_links_chiuso_completo" CHECK (
    "status" = 'active' OR ("closed_at" IS NOT NULL AND "close_reason" IS NOT NULL)
  ),
  -- ⭐ Le causali sono le stesse delle sorelle, e coprono i casi decisi:
  --    §1.13.3 «non esiste piu' su Shopify» -> remote_delete / not_found;
  --    §1.13.3 «l'utente puo' collegare esplicitamente la sede a un'altra
  --    location» -> operator; il cambio negozio -> shop_change, deciso dal
  --    proprietario il 07/09/2026 (§8.5.1 nominava solo prodotto e variante).
  CONSTRAINT "shopify_location_links_causale_eliminato" CHECK (
    "status" <> 'remotely_deleted' OR "close_reason" IN ('remote_delete', 'not_found')
  ),
  CONSTRAINT "shopify_location_links_causale_scollegato" CHECK (
    "status" <> 'unlinked' OR "close_reason" IN ('operator', 'shop_change')
  ),
  -- ⚠️ Blocca l'auto-riferimento (A verso A). NON blocca un ciclo fra due righe
  --    (A verso B, B verso A): un CHECK di riga non puo' vedere un'altra riga, e
  --    la garanzia resta applicativa — la stessa dichiarazione di §8.5.2 per le
  --    tabelle sorelle. Il successore si scrive in un UPDATE che segue l'INSERT
  --    del link nuovo, mai in un ordine che permetta due righe di puntarsi a
  --    vicenda.
  CONSTRAINT "shopify_location_links_successore_non_se_stesso" CHECK (
    "superseded_by_link_id" IS NULL OR "superseded_by_link_id" <> "id"
  )
);

-- Garanzia 1-2 per le sedi: un GID di location compare UNA VOLTA SOLA, storico
-- incluso. E' cio' che rende impossibile riusarlo dopo la chiusura, e quindi
-- verificabile il divieto di riaggancio automatico.
CREATE UNIQUE INDEX "shopify_location_links_shop_id_shopify_location_gid_key"
  ON "shopify_location_links" ("shop_id", "shopify_location_gid");

-- ⭐ Ausiliaria della FK di successione. Porta il TENANT e non il negozio: il
--    proprietario ha deciso il 07/09/2026 che predecessore e successore devono
--    appartenere allo stesso tenant e alla stessa SEDE. Imporre lo stesso
--    negozio impedirebbe la sostituzione dopo un cambio negozio, che e'
--    esattamente uno dei casi in cui il collegamento si sostituisce.
CREATE UNIQUE INDEX "shopify_location_links_id_location_id_tenant_id_key"
  ON "shopify_location_links" ("id", "location_id", "tenant_id");

CREATE INDEX "shopify_location_links_tenant_id_shopify_location_gid_idx"
  ON "shopify_location_links" ("tenant_id", "shopify_location_gid");
CREATE INDEX "shopify_location_links_tenant_id_location_id_status_idx"
  ON "shopify_location_links" ("tenant_id", "location_id", "status");

-- ⭐ Garanzia 3-4 per le sedi — UNA SEDE, UN SOLO COLLEGAMENTO VIVO, deciso dal
--    proprietario il 07/09/2026 fra le due formulazioni scritte che non
--    coincidevano (§1.13.1 «uno-a-uno dentro lo stesso negozio» contro le
--    garanzie 3-4 di §8.5.2, che sono per entita' locale). Vince la piu'
--    stretta, col metodo di §8.5.1: il vincolo si rilassa solo dopo aver
--    dichiarato per iscritto il caso commerciale che lo giustifica.
--
-- ⚠️ Senza `shop_id` NELL'INDICE: una sede non puo' essere collegata a due
--    negozi insieme. Sincronizzare quantita' verso due negozi richiederebbe una
--    regola di ripartizione che non esiste e non e' stata chiesta.
CREATE UNIQUE INDEX "shopify_location_links_location_attivo_key"
  ON "shopify_location_links" ("location_id")
  WHERE "status" = 'active';

ALTER TABLE "shopify_location_links"
  ADD CONSTRAINT "shopify_location_links_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- FK COMPOSITE: negozio e sede sono dello stesso tenant del collegamento.
  ADD CONSTRAINT "shopify_location_links_shop_id_tenant_id_fkey" FOREIGN KEY ("shop_id", "tenant_id")
    REFERENCES "shopify_shops" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_location_links_location_id_tenant_id_fkey" FOREIGN KEY ("location_id", "tenant_id")
    REFERENCES "locations" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Il successore appartiene allo STESSO tenant e alla STESSA sede.
  -- ⚠️ `RESTRICT` esplicito: mai SET NULL (perderebbe il legame in silenzio),
  --    mai CASCADE (propagherebbe una cancellazione lungo la catena).
  ADD CONSTRAINT "shopify_location_links_superseded_by_fkey"
    FOREIGN KEY ("superseded_by_link_id", "location_id", "tenant_id")
    REFERENCES "shopify_location_links" ("id", "location_id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "shopify_location_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_location_links" FROM PUBLIC, anon, authenticated;

-- ── shopify_connections.shop_id: la connessione punta al negozio ────────────
--
-- ⭐ Decisa in §8.5.1: «la connessione punta al negozio, non lo sostituisce».
--    Senza, non esiste modo — nel database — di dire quale riga di
--    `shopify_shops` sia quella corrente per un tenant, e il passo 2 della
--    transazione di cambio negozio non ha dove scrivere. Era l'unica voce di
--    §8.5.1 decisa senza condizioni e assente da entrambi i file.
--
-- ⚠️ NULLABLE, e per la stessa ragione di `shop_gid`: il valore non esiste nei
--    dati locali e lo acquisisce la fase 2. Una connessione `not_connected` non
--    ha inoltre alcun negozio a cui puntare, quindi il NOT NULL non sarebbe
--    corretto nemmeno a regime.

ALTER TABLE "shopify_connections" ADD COLUMN "shop_id" UUID;

CREATE INDEX "shopify_connections_shop_id_idx" ON "shopify_connections" ("shop_id");

ALTER TABLE "shopify_connections"
  ADD CONSTRAINT "shopify_connections_shop_id_tenant_id_fkey" FOREIGN KEY ("shop_id", "tenant_id")
    REFERENCES "shopify_shops" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
