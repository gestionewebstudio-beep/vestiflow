-- Storico dei collegamenti Shopify — FASE 1: solo schema (docs/24 §8.5.1-§8.5.8).
--
-- ⛔ STORIA DI QUESTO FILE, e va letta prima di applicarlo.
--    Una versione PRECEDENTE di questa migration e' stata applicata per
--    ERRORE al database condiviso, e successivamente rimossa. La versione
--    attuale — con `shopify_location_pairs`, `shopify_location_links`,
--    `shopify_connections.shop_id` e l'ausiliaria su `locations` — e' stata
--    collaudata SOLTANTO IN LOCALE.
--
-- ⚠️ Non e' un dettaglio di cronaca: se «rimossa» ha riguardato solo la riga di
--    `_prisma_migrations` e non gli oggetti, il condiviso porta ancora enum e
--    tabelle di quella versione, e questa migration fallirebbe al primo
--    `CREATE TYPE` con «type already exists». E' esattamente lo stato in cui e'
--    stata trovata una copia locale il 07/09/2026: schema avanti, registro
--    indietro.
--
-- ⛔ PRIMA di applicarla al condiviso va quindi verificato, in sola lettura,
--    che non esistano residui: gli enum `ShopifyLinkStatus` /
--    `ShopifyLinkCloseReason`, le tabelle `shopify_shops`,
--    `shopify_product_links`, `shopify_variant_links`, gli indici ausiliari su
--    `products` / `product_variants`. Se ci sono, la rimozione dei residui e'
--    un passo dichiarato e autorizzato a parte — non una `IF NOT EXISTS`
--    aggiunta qui, che nasconderebbe la divergenza invece di chiuderla.
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
  'shop_change',
  -- Ammessa SOLO su prodotti e varianti, e i CHECK a lista bianca lo
  -- impongono: una sede non si elimina definitivamente finche' ha una
  -- storia (§1.13.4). L'enum e' condiviso, il permesso no.
  'local_delete'
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


-- ═══════════════════════════════════════════════════════════════════════════
-- IDENTITA' REMOTE E PERIODI — la famiglia ARTICOLI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⭐ Stessa forma delle sedi — identita' stabile + periodi — con UNA differenza
--    che non e' un dettaglio: per gli articoli NON c'e' unicita' totale
--    sull'anagrafica locale. Una ripubblicazione genera un GID nuovo per lo
--    stesso prodotto, quindi PIU' IDENTITA' STORICHE convivono sullo stesso
--    articolo. A restare unico e' il collegamento ATTIVO.
--
-- ⛔ E l'appartenenza e' scritta DUE VOLTE, non una:
--      original_product_id   l'appartenenza ORIGINARIA. NOT NULL, immutabile,
--                            e SENZA chiave esterna: e' un dato storico, come
--                            gli snapshot documentali. Non si azzera nemmeno
--                            quando il prodotto viene eliminato.
--      product_id            il riferimento VIVO. Nullable, con FK RESTRICT.
--                            Si sgancia alla purga.
--    Un CHECK impone che il vivo, quando c'e', sia l'originario: dopo lo
--    sganciamento non esiste un valore da mettere che punti altrove.

-- ── Ausiliarie sulle identita' di negozio, per le FK composite ──────────────
-- (shopify_shops ha gia' UNIQUE (id, tenant_id) piu' sopra)

-- ── shopify_product_identities ──────────────────────────────────────────────

CREATE TABLE "shopify_product_identities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "shopify_product_gid" TEXT NOT NULL,
  "original_product_id" UUID NOT NULL,
  "product_id" UUID,
  "local_deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  -- ⭐ Colonna GENERATA: e' cio' che rende DICHIARATIVO «un periodo attivo
  --    esige un'identita' viva». Un trigger non regge in concorrenza — misurato
  --    il 07/09/2026: due sessioni si incrociano, entrambe committano, e resta
  --    un periodo attivo su un'identita' eliminata. Una FK invece la serializza
  --    PostgreSQL da se'.
  "viva" BOOLEAN GENERATED ALWAYS AS ("product_id" IS NOT NULL) STORED,

  CONSTRAINT "shopify_product_identities_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "shopify_product_identities_gid_forma" CHECK (
    "shopify_product_gid" ~ '^gid://shopify/Product/[0-9]+$'
  ),
  -- Il riferimento vivo, quando c'e', E' l'articolo originario. Dopo lo
  -- sganciamento non esiste un valore che punti altrove.
  CONSTRAINT "shopify_product_identities_vivo_e_originario" CHECK (
    "product_id" IS NULL OR "product_id" = "original_product_id"
  ),
  -- O viva, o eliminata localmente. Nessun terzo stato.
  CONSTRAINT "shopify_product_identities_stato_coerente" CHECK (
    ("product_id" IS NULL) = ("local_deleted_at" IS NOT NULL)
  )
);

-- ⛔ L'IDENTITA' REMOTA E' UNICA PER NEGOZIO, e su TUTTE le righe: e' cio' che
--    impedisce di riassegnare un GID a un altro articolo.
CREATE UNIQUE INDEX "shopify_product_identities_shop_id_gid_key"
  ON "shopify_product_identities" ("shop_id", "shopify_product_gid");

-- ⭐ NESSUNA unicita' su original_product_id: piu' identita' storiche per lo
--    stesso articolo sono il caso NORMALE dopo una ripubblicazione.
CREATE INDEX "shopify_product_identities_tenant_id_original_product_id_idx"
  ON "shopify_product_identities" ("tenant_id", "original_product_id");

CREATE UNIQUE INDEX "shopify_product_identities_id_tenant_id_key"
  ON "shopify_product_identities" ("id", "tenant_id");
CREATE UNIQUE INDEX "shopify_product_identities_id_shop_id_key"
  ON "shopify_product_identities" ("id", "shop_id");
CREATE UNIQUE INDEX "shopify_product_identities_id_original_product_id_key"
  ON "shopify_product_identities" ("id", "original_product_id");
-- L'ausiliaria della FK dichiarativa: (id, viva).
CREATE UNIQUE INDEX "shopify_product_identities_id_viva_key"
  ON "shopify_product_identities" ("id", "viva");

ALTER TABLE "shopify_product_identities"
  ADD CONSTRAINT "shopify_product_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_product_identities_shop_id_tenant_id_fkey" FOREIGN KEY ("shop_id", "tenant_id")
    REFERENCES "shopify_shops" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- ⚠️ Si disarma quando product_id va a NULL, ed e' VOLUTO: e' cio' che rende
  --    possibile l'eliminazione definitiva senza toccare RESTRICT. Cio' che la
  --    FK smette di garantire lo garantisce la FK diretta sul tenant, che non
  --    passa da questa colonna.
  ADD CONSTRAINT "shopify_product_identities_product_id_tenant_id_fkey" FOREIGN KEY ("product_id", "tenant_id")
    REFERENCES "products" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shopify_product_identities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_product_identities" FROM PUBLIC, anon, authenticated;

-- ── shopify_variant_identities ──────────────────────────────────────────────

CREATE TABLE "shopify_variant_identities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "product_identity_id" UUID NOT NULL,
  "shopify_variant_gid" TEXT NOT NULL,
  "shopify_inventory_item_gid" TEXT,
  "original_variant_id" UUID NOT NULL,
  "original_product_id" UUID NOT NULL,
  "variant_id" UUID,
  "product_id" UUID,
  "local_deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  "viva" BOOLEAN GENERATED ALWAYS AS ("variant_id" IS NOT NULL) STORED,
  -- ⭐ L'anello che dichiara la GERARCHIA: una variante viva esige un prodotto
  --    vivo. Senza, si sgancia il prodotto lasciando la variante agganciata —
  --    misurato, e nessun vincolo se ne accorgeva.
  "richiede_padre_vivo" BOOLEAN GENERATED ALWAYS AS (
    CASE WHEN "variant_id" IS NOT NULL THEN true END
  ) STORED,

  CONSTRAINT "shopify_variant_identities_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "shopify_variant_identities_gid_forma" CHECK (
    "shopify_variant_gid" ~ '^gid://shopify/ProductVariant/[0-9]+$'
  ),
  CONSTRAINT "shopify_variant_identities_inventory_gid_forma" CHECK (
    "shopify_inventory_item_gid" IS NULL
    OR "shopify_inventory_item_gid" ~ '^gid://shopify/InventoryItem/[0-9]+$'
  ),
  CONSTRAINT "shopify_variant_identities_vivo_e_originario" CHECK (
    "variant_id" IS NULL OR "variant_id" = "original_variant_id"
  ),
  CONSTRAINT "shopify_variant_identities_prodotto_originario" CHECK (
    "product_id" IS NULL OR "product_id" = "original_product_id"
  ),
  CONSTRAINT "shopify_variant_identities_stato_coerente" CHECK (
    ("variant_id" IS NULL) = ("local_deleted_at" IS NOT NULL)
  ),
  -- ⛔ Niente stato intermedio «variante sganciata, prodotto ancora agganciato»
  --    sulla stessa riga: i due riferimenti vivi si sganciano insieme.
  CONSTRAINT "shopify_variant_identities_riferimenti_insieme" CHECK (
    ("variant_id" IS NULL) = ("product_id" IS NULL)
  )
);

CREATE UNIQUE INDEX "shopify_variant_identities_shop_id_variant_gid_key"
  ON "shopify_variant_identities" ("shop_id", "shopify_variant_gid");
-- La quinta garanzia (§8.5.2): variante <-> inventory item e' uno-a-uno.
CREATE UNIQUE INDEX "shopify_variant_identities_shop_id_inventory_gid_key"
  ON "shopify_variant_identities" ("shop_id", "shopify_inventory_item_gid");

CREATE INDEX "shopify_variant_identities_tenant_id_original_variant_id_idx"
  ON "shopify_variant_identities" ("tenant_id", "original_variant_id");
CREATE UNIQUE INDEX "shopify_variant_identities_id_tenant_id_key"
  ON "shopify_variant_identities" ("id", "tenant_id");
CREATE UNIQUE INDEX "shopify_variant_identities_id_original_variant_id_key"
  ON "shopify_variant_identities" ("id", "original_variant_id");
CREATE UNIQUE INDEX "shopify_variant_identities_id_viva_key"
  ON "shopify_variant_identities" ("id", "viva");

ALTER TABLE "shopify_variant_identities"
  ADD CONSTRAINT "shopify_variant_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_variant_identities_shop_id_tenant_id_fkey" FOREIGN KEY ("shop_id", "tenant_id")
    REFERENCES "shopify_shops" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Il padre e' dello stesso tenant…
  ADD CONSTRAINT "shopify_variant_identities_padre_tenant_fkey" FOREIGN KEY ("product_identity_id", "tenant_id")
    REFERENCES "shopify_product_identities" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- …dello stesso negozio…
  ADD CONSTRAINT "shopify_variant_identities_padre_shop_fkey" FOREIGN KEY ("product_identity_id", "shop_id")
    REFERENCES "shopify_product_identities" ("id", "shop_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- …e dello stesso PRODOTTO ORIGINARIO. ⭐ Questa regge anche a riferimenti
  -- sganciati, perche' confronta le colonne originarie, che non si azzerano.
  ADD CONSTRAINT "shopify_variant_identities_padre_originario_fkey"
    FOREIGN KEY ("product_identity_id", "original_product_id")
    REFERENCES "shopify_product_identities" ("id", "original_product_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- ⭐ GERARCHIA DICHIARATIVA: variante viva => prodotto vivo.
  ADD CONSTRAINT "shopify_variant_identities_padre_vivo_fkey"
    FOREIGN KEY ("product_identity_id", "richiede_padre_vivo")
    REFERENCES "shopify_product_identities" ("id", "viva")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "shopify_variant_identities_variant_id_tenant_id_fkey" FOREIGN KEY ("variant_id", "tenant_id")
    REFERENCES "product_variants" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- La variante e' figlia di quel prodotto, finche' le anagrafiche esistono.
  ADD CONSTRAINT "shopify_variant_identities_variante_del_prodotto_fkey" FOREIGN KEY ("variant_id", "product_id")
    REFERENCES "product_variants" ("id", "product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shopify_variant_identities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_variant_identities" FROM PUBLIC, anon, authenticated;


-- ── I PERIODI di collegamento — prodotto ────────────────────────────────────

CREATE TABLE "shopify_product_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "identity_id" UUID NOT NULL,
  "original_product_id" UUID NOT NULL,
  "status" "ShopifyLinkStatus" NOT NULL DEFAULT 'active',
  "close_reason" "ShopifyLinkCloseReason",
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "last_event_at" TIMESTAMP(3),
  "last_event_triggered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  -- ⭐ NULL quando il periodo e' chiuso: MATCH SIMPLE non verifica una FK con
  --    una colonna NULL, quindi un periodo CHIUSO puo' restare su un'identita'
  --    sganciata — la storia sopravvive alla purga. Un periodo ATTIVO invece
  --    porta `true`, e la FK esige un'identita' viva.
  "richiede_viva" BOOLEAN GENERATED ALWAYS AS (
    CASE WHEN "status" = 'active' THEN true END
  ) STORED,
  "attivo" BOOLEAN GENERATED ALWAYS AS (
    CASE WHEN "status" = 'active' THEN true END
  ) STORED,

  CONSTRAINT "shopify_product_links_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "shopify_product_links_attivo_pulito" CHECK (
    "status" <> 'active' OR ("closed_at" IS NULL AND "close_reason" IS NULL)
  ),
  CONSTRAINT "shopify_product_links_chiuso_completo" CHECK (
    "status" = 'active' OR ("closed_at" IS NOT NULL AND "close_reason" IS NOT NULL)
  ),
  CONSTRAINT "shopify_product_links_causale_eliminato" CHECK (
    "status" <> 'remotely_deleted' OR "close_reason" IN ('remote_delete', 'not_found')
  ),
  -- ⭐ `local_delete` e' ammessa QUI e sulle varianti, NON sulle sedi: una sede
  --    non si elimina definitivamente finche' ha una storia (§1.13.4).
  CONSTRAINT "shopify_product_links_causale_scollegato" CHECK (
    "status" <> 'unlinked' OR "close_reason" IN ('operator', 'shop_change', 'local_delete')
  ),
  CONSTRAINT "shopify_product_links_periodo_coerente" CHECK (
    "closed_at" IS NULL OR "closed_at" >= "linked_at"
  )
);

-- Un solo periodo vivo per IDENTITA'…
CREATE UNIQUE INDEX "shopify_product_links_identity_attivo_key"
  ON "shopify_product_links" ("identity_id") WHERE "status" = 'active';
-- …e un solo collegamento vivo per ANAGRAFICA locale, che e' la condizione 2:
-- piu' identita' storiche convivono, un solo collegamento attivo.
CREATE UNIQUE INDEX "shopify_product_links_original_attivo_key"
  ON "shopify_product_links" ("original_product_id") WHERE "status" = 'active';

CREATE UNIQUE INDEX "shopify_product_links_id_attivo_key"
  ON "shopify_product_links" ("id", "attivo");
CREATE INDEX "shopify_product_links_identity_id_linked_at_idx"
  ON "shopify_product_links" ("identity_id", "linked_at");
CREATE INDEX "shopify_product_links_tenant_id_status_idx"
  ON "shopify_product_links" ("tenant_id", "status");

ALTER TABLE "shopify_product_links"
  ADD CONSTRAINT "shopify_product_links_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_product_links_identity_tenant_fkey" FOREIGN KEY ("identity_id", "tenant_id")
    REFERENCES "shopify_product_identities" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- La denormalizzazione non puo' mentire.
  ADD CONSTRAINT "shopify_product_links_identity_originario_fkey"
    FOREIGN KEY ("identity_id", "original_product_id")
    REFERENCES "shopify_product_identities" ("id", "original_product_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- ⭐ IL RIMEDIO AL DIFETTO DI CONCORRENZA: un periodo ATTIVO esige
  --    un'identita' VIVA, e lo esige una FK — che PostgreSQL serializza.
  ADD CONSTRAINT "shopify_product_links_identita_viva_fkey"
    FOREIGN KEY ("identity_id", "richiede_viva")
    REFERENCES "shopify_product_identities" ("id", "viva")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "shopify_product_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_product_links" FROM PUBLIC, anon, authenticated;

-- ── I PERIODI di collegamento — variante ────────────────────────────────────

CREATE TABLE "shopify_variant_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "identity_id" UUID NOT NULL,
  "original_variant_id" UUID NOT NULL,
  "product_link_id" UUID,
  "status" "ShopifyLinkStatus" NOT NULL DEFAULT 'active',
  "close_reason" "ShopifyLinkCloseReason",
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "last_event_at" TIMESTAMP(3),
  "last_event_triggered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  "richiede_viva" BOOLEAN GENERATED ALWAYS AS (
    CASE WHEN "status" = 'active' THEN true END
  ) STORED,
  -- Un periodo variante attivo esige un periodo prodotto attivo: e' il legame
  -- che la migration precedente aveva come `product_link_id` NOT NULL, e che
  -- qui regge anche quando il periodo padre e' chiuso (la colonna e' NULL).
  "richiede_padre_attivo" BOOLEAN GENERATED ALWAYS AS (
    CASE WHEN "status" = 'active' THEN true END
  ) STORED,

  CONSTRAINT "shopify_variant_links_pkey" PRIMARY KEY ("id"),

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
    "status" <> 'unlinked' OR "close_reason" IN ('operator', 'shop_change', 'local_delete')
  ),
  CONSTRAINT "shopify_variant_links_periodo_coerente" CHECK (
    "closed_at" IS NULL OR "closed_at" >= "linked_at"
  ),
  -- Un periodo attivo dichiara il proprio periodo padre.
  CONSTRAINT "shopify_variant_links_padre_dichiarato" CHECK (
    "status" <> 'active' OR "product_link_id" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "shopify_variant_links_identity_attivo_key"
  ON "shopify_variant_links" ("identity_id") WHERE "status" = 'active';
CREATE UNIQUE INDEX "shopify_variant_links_original_attivo_key"
  ON "shopify_variant_links" ("original_variant_id") WHERE "status" = 'active';
CREATE INDEX "shopify_variant_links_identity_id_linked_at_idx"
  ON "shopify_variant_links" ("identity_id", "linked_at");
CREATE INDEX "shopify_variant_links_tenant_id_status_idx"
  ON "shopify_variant_links" ("tenant_id", "status");

ALTER TABLE "shopify_variant_links"
  ADD CONSTRAINT "shopify_variant_links_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_variant_links_identity_tenant_fkey" FOREIGN KEY ("identity_id", "tenant_id")
    REFERENCES "shopify_variant_identities" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_variant_links_identity_originario_fkey"
    FOREIGN KEY ("identity_id", "original_variant_id")
    REFERENCES "shopify_variant_identities" ("id", "original_variant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_variant_links_identita_viva_fkey"
    FOREIGN KEY ("identity_id", "richiede_viva")
    REFERENCES "shopify_variant_identities" ("id", "viva")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "shopify_variant_links_padre_attivo_fkey"
    FOREIGN KEY ("product_link_id", "richiede_padre_attivo")
    REFERENCES "shopify_product_links" ("id", "attivo")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "shopify_variant_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_variant_links" FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- LE PROTEZIONI — immutabilita', nascita, e il divieto di cancellare la storia
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Un'identita' NASCE AGGANCIATA ───────────────────────────────────────
--
-- ⛔ Senza, l'identita' puo' nascere gia' sganciata e l'appartenenza originaria
--    non viene verificata NEMMENO UNA VOLTA: `original_product_id` non ha FK, e
--    con `product_id` NULL nessun vincolo guarda quel valore. Misurato: due
--    INSERT riusciti con un articolo inesistente.
-- ⭐ Nata viva, il CHECK «vivo = originario» piu' la FK composita verificano
--    l'appartenenza UNA volta, e l'immutabilita' la tiene valida per sempre.

-- ⚠️ DUE funzioni, non una condivisa: plpgsql risolve `NEW.<campo>` anche nel
--    ramo non preso, quindi una funzione che nomina `variant_id` fallisce
--    sulla tabella prodotto con «record "new" has no field». Misurato.

CREATE OR REPLACE FUNCTION "shopify_product_identities_nasce_agganciata"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."product_id" IS NULL THEN
    RAISE EXCEPTION 'shopify_product_identities_nasce_agganciata: un''identita'' nasce agganciata al proprio articolo'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "shopify_variant_identities_nasce_agganciata"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."variant_id" IS NULL THEN
    RAISE EXCEPTION 'shopify_variant_identities_nasce_agganciata: un''identita'' nasce agganciata alla propria variante'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "shopify_product_identities_nasce_agganciata"
  BEFORE INSERT ON "shopify_product_identities"
  FOR EACH ROW EXECUTE FUNCTION "shopify_product_identities_nasce_agganciata"();
CREATE TRIGGER "shopify_variant_identities_nasce_agganciata"
  BEFORE INSERT ON "shopify_variant_identities"
  FOR EACH ROW EXECUTE FUNCTION "shopify_variant_identities_nasce_agganciata"();

-- ── 2 · L'identita' non si riassegna ────────────────────────────────────────

CREATE OR REPLACE FUNCTION "shopify_product_identities_immutabile"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."shop_id" IS DISTINCT FROM OLD."shop_id"
     OR NEW."shopify_product_gid" IS DISTINCT FROM OLD."shopify_product_gid"
     OR NEW."original_product_id" IS DISTINCT FROM OLD."original_product_id" THEN
    RAISE EXCEPTION 'shopify_product_identities_immutabile: l''identita'' remota non si riassegna'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Il riferimento vivo si SGANCIA soltanto: mai riagganciato, mai spostato.
  IF OLD."product_id" IS NULL AND NEW."product_id" IS NOT NULL THEN
    RAISE EXCEPTION 'shopify_product_identities_immutabile: un''identita'' sganciata non si riaggancia'
      USING ERRCODE = 'check_violation';
  END IF;
  -- ⭐ `local_deleted_at` si scrive UNA volta: l'eliminazione di un prodotto non
  --    riscrive la data di una variante eliminata prima.
  IF OLD."local_deleted_at" IS NOT NULL
     AND NEW."local_deleted_at" IS DISTINCT FROM OLD."local_deleted_at" THEN
    RAISE EXCEPTION 'shopify_product_identities_immutabile: la data di eliminazione non si riscrive'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "shopify_product_identities_immutabile"
  BEFORE UPDATE ON "shopify_product_identities"
  FOR EACH ROW EXECUTE FUNCTION "shopify_product_identities_immutabile"();

CREATE OR REPLACE FUNCTION "shopify_variant_identities_immutabile"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."shop_id" IS DISTINCT FROM OLD."shop_id"
     OR NEW."product_identity_id" IS DISTINCT FROM OLD."product_identity_id"
     OR NEW."shopify_variant_gid" IS DISTINCT FROM OLD."shopify_variant_gid"
     OR NEW."shopify_inventory_item_gid" IS DISTINCT FROM OLD."shopify_inventory_item_gid"
     OR NEW."original_variant_id" IS DISTINCT FROM OLD."original_variant_id"
     OR NEW."original_product_id" IS DISTINCT FROM OLD."original_product_id" THEN
    RAISE EXCEPTION 'shopify_variant_identities_immutabile: l''identita'' remota non si riassegna'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD."variant_id" IS NULL AND NEW."variant_id" IS NOT NULL)
     OR (OLD."product_id" IS NULL AND NEW."product_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'shopify_variant_identities_immutabile: un''identita'' sganciata non si riaggancia'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."local_deleted_at" IS NOT NULL
     AND NEW."local_deleted_at" IS DISTINCT FROM OLD."local_deleted_at" THEN
    RAISE EXCEPTION 'shopify_variant_identities_immutabile: la data di eliminazione non si riscrive'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "shopify_variant_identities_immutabile"
  BEFORE UPDATE ON "shopify_variant_identities"
  FOR EACH ROW EXECUTE FUNCTION "shopify_variant_identities_immutabile"();

-- ── 3 · Un periodo chiuso non si riapre e non si riscrive ───────────────────

CREATE OR REPLACE FUNCTION "shopify_periodo_immutabile"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."identity_id" IS DISTINCT FROM OLD."identity_id"
     OR NEW."linked_at" IS DISTINCT FROM OLD."linked_at" THEN
    RAISE EXCEPTION 'shopify_periodo_immutabile: appartenenza e apertura del periodo non si modificano'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" <> 'active'
     AND (NEW."status" <> OLD."status"
          OR NEW."close_reason" IS DISTINCT FROM OLD."close_reason"
          OR NEW."closed_at" IS DISTINCT FROM OLD."closed_at") THEN
    RAISE EXCEPTION 'shopify_periodo_immutabile: un periodo chiuso non si riapre e la sua causale non si riscrive'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "shopify_product_links_immutabile"
  BEFORE UPDATE ON "shopify_product_links"
  FOR EACH ROW EXECUTE FUNCTION "shopify_periodo_immutabile"();
CREATE TRIGGER "shopify_variant_links_immutabile"
  BEFORE UPDATE ON "shopify_variant_links"
  FOR EACH ROW EXECUTE FUNCTION "shopify_periodo_immutabile"();

-- ── 4 · LA STORIA NON SI CANCELLA — e il TRUNCATE non e' un DELETE ──────────
--
-- ⛔ Misurato il 07/09/2026: il DELETE del PERIODO passava (nessun vincolo lo
--    guardava), e da li' passava anche quello dell'identita' — con lo stesso GID
--    che rinasceva su un altro prodotto. E' la stessa asimmetria gia' vista
--    sulle sedi («i due UNIQUE impediscono di INSERIRE, non di MODIFICARE») un
--    passo piu' in la': non impediscono nemmeno di CANCELLARE.
--
-- ⭐ Il divieto sta sui PERIODI e sulle IDENTITA' ARTICOLO, e NON si estende ad
--    altre tabelle del gestionale: e' la storia dei collegamenti remoti, non un
--    append-only generale.
--
-- ⚠️ E NON impedisce l'eliminazione definitiva dell'ANAGRAFICA: `products` e
--    `product_variants` restano cancellabili una volta sganciati. Si conserva
--    l'identita' remota, non si vieta la purga locale.
--
-- ⛔ NON e' una barriera di PRIVILEGI, e non va letta come tale: l'API si
--    connette come OWNER del database — la stessa scelta per cui scavalca la
--    RLS — quindi `ALTER TABLE … DISABLE TRIGGER` da un servizio riuscirebbe.
--    Questi trigger fermano la cancellazione ACCIDENTALE (un CASCADE, un
--    TRUNCATE di pulizia, una query di manutenzione), non un servizio che si
--    metta deliberatamente a spegnerli. A fermare QUELLO e' una guardia
--    statica, `check:storico-non-cancellabile`, che fa fallire il lint.

CREATE OR REPLACE FUNCTION "shopify_storico_non_si_cancella"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'shopify_storico_non_si_cancella: % e'' storia dei collegamenti remoti e non si cancella', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "shopify_product_identities_mai_delete"
  BEFORE DELETE ON "shopify_product_identities"
  FOR EACH ROW EXECUTE FUNCTION "shopify_storico_non_si_cancella"();
CREATE TRIGGER "shopify_product_identities_mai_truncate"
  BEFORE TRUNCATE ON "shopify_product_identities"
  FOR EACH STATEMENT EXECUTE FUNCTION "shopify_storico_non_si_cancella"();

CREATE TRIGGER "shopify_variant_identities_mai_delete"
  BEFORE DELETE ON "shopify_variant_identities"
  FOR EACH ROW EXECUTE FUNCTION "shopify_storico_non_si_cancella"();
CREATE TRIGGER "shopify_variant_identities_mai_truncate"
  BEFORE TRUNCATE ON "shopify_variant_identities"
  FOR EACH STATEMENT EXECUTE FUNCTION "shopify_storico_non_si_cancella"();

CREATE TRIGGER "shopify_product_links_mai_delete"
  BEFORE DELETE ON "shopify_product_links"
  FOR EACH ROW EXECUTE FUNCTION "shopify_storico_non_si_cancella"();
CREATE TRIGGER "shopify_product_links_mai_truncate"
  BEFORE TRUNCATE ON "shopify_product_links"
  FOR EACH STATEMENT EXECUTE FUNCTION "shopify_storico_non_si_cancella"();

CREATE TRIGGER "shopify_variant_links_mai_delete"
  BEFORE DELETE ON "shopify_variant_links"
  FOR EACH ROW EXECUTE FUNCTION "shopify_storico_non_si_cancella"();
CREATE TRIGGER "shopify_variant_links_mai_truncate"
  BEFORE TRUNCATE ON "shopify_variant_links"
  FOR EACH STATEMENT EXECUTE FUNCTION "shopify_storico_non_si_cancella"();


-- ── LA COPPIA E I SUOI PERIODI — due tabelle, non una ──────────────────────
--
-- ⭐ Deciso dal proprietario il 07/09/2026 (docs/24 §1.13.6): una sede
--    VestiFlow e una location Shopify, una volta abbinate e usate, NON si
--    riassegnano ad altre controparti. Si puo' interrompere e ripristinare LA
--    STESSA coppia; se serve un abbinamento diverso, si crea una nuova sede.
--
-- ⛔ **Un solo indice sui collegamenti attivi NON basta**, ed e' la ragione per
--    cui le tabelle sono due. Con `UNIQUE (location_id) WHERE status='active'`
--    la sede resterebbe libera di legarsi a un'altra location non appena il
--    collegamento e' chiuso: la riassegnazione passerebbe, e sarebbe proprio
--    cio' che la decisione esclude.
--
-- ⭐ La COPPIA e' stabile e porta i due vincoli TOTALI che vietano la
--    riassegnazione; i PERIODI dicono quando quella coppia e' stata attiva, e
--    sono molti nel tempo. La distinzione fra le due cose e' il modello.
--
-- ⛔ `superseded_by_link_id` NON esiste piu' su questa famiglia. Era stato
--    deciso il 07/09/2026 per la «sostituzione esplicita», e la decisione dello
--    stesso giorno l'ha superata: senza procedure di sostituzione non esiste un
--    successore da indicare. I periodi di una coppia si susseguono nel tempo, e
--    si leggono ordinati per `linked_at`.

-- ── shopify_location_pairs: la coppia, stabile ──────────────────────────────
--
-- ⚠️ Nessuna colonna di NOME o INDIRIZZO, ed e' deliberato due volte: le
--    anagrafiche non si sincronizzano (§1.13.2), e «cambiare soltanto nome o
--    indirizzo non cambia l'identita' della coppia» (§1.13.6). Un nome qui
--    sarebbe anche l'appiglio per il riaggancio automatico che il modello
--    esiste per impedire.

CREATE TABLE "shopify_location_pairs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "shopify_location_gid" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "shopify_location_pairs_pkey" PRIMARY KEY ("id"),

  -- Solo un GID di LOCATION. La forma e' gia' quella usata dal codice di
  -- produzione (`shopify-location-id.util.ts`): qui la impone il database.
  CONSTRAINT "shopify_location_pairs_gid_forma" CHECK (
    "shopify_location_gid" ~ '^gid://shopify/Location/[0-9]+$'
  )
);

-- ⛔ I DUE VINCOLI CHE VIETANO LA RIASSEGNAZIONE, e sono TOTALI — non parziali
--    su `active`, o non vieterebbero niente.
--
--    Il primo: una sede appartiene a UNA sola coppia, per sempre. Se il nuovo
--    negozio richiede una location diversa, si usa una nuova sede (§1.13.6).
CREATE UNIQUE INDEX "shopify_location_pairs_location_id_key"
  ON "shopify_location_pairs" ("location_id");

--    Il secondo: una location appartiene a UNA sola coppia, per sempre. E' cio'
--    che impedisce di aggirare il divieto creando una sede nuova e collegandola
--    a una location gia' appartenuta a un'altra sede — il caso che la decisione
--    nomina esplicitamente.
CREATE UNIQUE INDEX "shopify_location_pairs_shop_id_shopify_location_gid_key"
  ON "shopify_location_pairs" ("shop_id", "shopify_location_gid");

-- Ausiliaria per la FK composita dei periodi.
CREATE UNIQUE INDEX "shopify_location_pairs_id_tenant_id_key"
  ON "shopify_location_pairs" ("id", "tenant_id");

CREATE INDEX "shopify_location_pairs_tenant_id_shopify_location_gid_idx"
  ON "shopify_location_pairs" ("tenant_id", "shopify_location_gid");

ALTER TABLE "shopify_location_pairs"
  ADD CONSTRAINT "shopify_location_pairs_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- FK COMPOSITE: negozio e sede sono dello stesso tenant della coppia.
  ADD CONSTRAINT "shopify_location_pairs_shop_id_tenant_id_fkey" FOREIGN KEY ("shop_id", "tenant_id")
    REFERENCES "shopify_shops" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_location_pairs_location_id_tenant_id_fkey" FOREIGN KEY ("location_id", "tenant_id")
    REFERENCES "locations" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ⛔ I DUE `UNIQUE` NON BASTANO, ed e' stato MISURATO il 07/09/2026: impediscono
--    di INSERIRE una seconda coppia, non di MODIFICARE quella che c'e'. Un
--    `UPDATE` del GID o della sede riassegnava la coppia senza che nessun
--    vincolo se ne accorgesse — due `UPDATE 1` di fila, sulla stessa riga.
--
-- ⭐ Le colonne identitarie sono quindi IMMUTABILI, e a imporlo e' un trigger:
--    e' l'unico modo dichiarativo che PostgreSQL offre per «questa colonna non
--    si cambia». Un CHECK non vede il valore precedente, e una revoca di
--    privilegio non morde perche' l'API si connette come owner.
--
-- ⚠️ E' il PRIMO trigger di questo database: fino a oggi le regole di questo
--    tipo vivevano in guardie statiche sul codice (`check:cassa-append-only`),
--    che pero' proteggono la superficie esposta, non il dato. Qui la decisione
--    e' «la coppia non si riassegna MAI», e una regola che vale sempre va dove
--    non si puo' aggirare.
--
-- ⭐ `updated_at` resta libera: si vieta l'identita', non la manutenzione.

CREATE OR REPLACE FUNCTION "shopify_location_pairs_vieta_riassegnazione"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."shop_id" IS DISTINCT FROM OLD."shop_id"
     OR NEW."location_id" IS DISTINCT FROM OLD."location_id"
     OR NEW."shopify_location_gid" IS DISTINCT FROM OLD."shopify_location_gid" THEN
    RAISE EXCEPTION
      'shopify_location_pairs_immutabile: la coppia sede-location non si riassegna (docs/24 §1.13.6). Per un abbinamento diverso si crea una nuova sede.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "shopify_location_pairs_immutabile"
  BEFORE UPDATE ON "shopify_location_pairs"
  FOR EACH ROW EXECUTE FUNCTION "shopify_location_pairs_vieta_riassegnazione"();

ALTER TABLE "shopify_location_pairs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_location_pairs" FROM PUBLIC, anon, authenticated;

-- ── shopify_location_links: i periodi di collegamento della coppia ──────────
--
-- ⭐ «E' consentito interrompere e ripristinare la stessa coppia, conservando
--    la storia» (§1.13.6): ogni ripristino apre un periodo NUOVO sulla stessa
--    coppia. La storia e' l'elenco dei periodi.
--
-- ⛔ I PERIODI NON SONO IL CHECKPOINT, e non lo sostituiscono. Il recupero
--    degli ordini riparte dall'ULTIMO CHECKPOINT RIUSCITO (docs/24 §1.15.2-3),
--    che e' un'altra cosa: dice fin dove si e' letto con successo, non quando
--    il collegamento era acceso. Un ordine puo' essere arrivato mentre il
--    collegamento era vivo e non essere stato acquisito.
--
-- ⭐ Cio' che i periodi danno e' il CONTESTO: quando il collegamento e' stato
--    interrotto e perche'. Serve a spiegare all'operatore che cosa e' successo
--    e a delimitare la finestra da ispezionare, non a decidere da dove
--    ripartire.
--
-- ⛔ Nessun `last_event_at` / `last_event_triggered_at`, al contrario delle due
--    tabelle sorelle: quelle colonne scartano eventi webhook fuori ordine
--    (§8.5.4), e per le location NON ESISTE alcun topic registrato
--    (`shopify-webhook-topics.ts`). Copiarle sarebbe inventare l'ordinamento di
--    eventi che non arrivano.

CREATE TABLE "shopify_location_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "pair_id" UUID NOT NULL,
  "status" "ShopifyLinkStatus" NOT NULL DEFAULT 'active',
  "close_reason" "ShopifyLinkCloseReason",
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "shopify_location_links_pkey" PRIMARY KEY ("id"),

  -- I CHECK di stato, da leggere come UN GRUPPO: il secondo non e' ridondante
  -- rispetto al terzo e al quarto, perche' `IN (...)` su NULL vale NULL e un
  -- CHECK fallisce solo su FALSE.
  CONSTRAINT "shopify_location_links_attivo_pulito" CHECK (
    "status" <> 'active' OR ("closed_at" IS NULL AND "close_reason" IS NULL)
  ),
  CONSTRAINT "shopify_location_links_chiuso_completo" CHECK (
    "status" = 'active' OR ("closed_at" IS NOT NULL AND "close_reason" IS NOT NULL)
  ),
  -- ⭐ Le causali coprono i casi decisi: §1.13.3 «non esiste piu' su Shopify»
  --    -> remote_delete / not_found; l'interruzione voluta -> operator; il
  --    cambio negozio -> shop_change.
  CONSTRAINT "shopify_location_links_causale_eliminato" CHECK (
    "status" <> 'remotely_deleted' OR "close_reason" IN ('remote_delete', 'not_found')
  ),
  CONSTRAINT "shopify_location_links_causale_scollegato" CHECK (
    "status" <> 'unlinked' OR "close_reason" IN ('operator', 'shop_change')
  ),
  -- Un periodo chiuso non puo' finire prima di cominciare.
  CONSTRAINT "shopify_location_links_periodo_coerente" CHECK (
    "closed_at" IS NULL OR "closed_at" >= "linked_at"
  )
);

-- ⭐ Un solo periodo VIVO per coppia. E' l'unico indice parziale della
--    famiglia, e qui basta davvero: la riassegnazione la vietano gia' i due
--    vincoli totali sulla coppia, non questo.
CREATE UNIQUE INDEX "shopify_location_links_pair_attivo_key"
  ON "shopify_location_links" ("pair_id")
  WHERE "status" = 'active';

-- La storia di una coppia si legge in ordine di tempo, ed e' cosi' che si
-- delimita la finestra da ispezionare quando un collegamento e' stato interrotto.
-- ⚠️ Non e' da qui che riparte il recupero degli ordini: quello parte
--    dall'ultimo checkpoint riuscito (docs/24 §1.15.2).
CREATE INDEX "shopify_location_links_pair_id_linked_at_idx"
  ON "shopify_location_links" ("pair_id", "linked_at");
CREATE INDEX "shopify_location_links_tenant_id_status_idx"
  ON "shopify_location_links" ("tenant_id", "status");

ALTER TABLE "shopify_location_links"
  ADD CONSTRAINT "shopify_location_links_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- ⚠️ `RESTRICT`, mai CASCADE: un abbinamento iniziale errato si corregge solo
  --    se non ha ancora prodotto effetti (§1.13.6), e in quel caso i periodi si
  --    rimuovono PRIMA della coppia, in un percorso esplicito che li ha
  --    verificati. Una cascata li porterebbe via senza che nessuno guardi.
  ADD CONSTRAINT "shopify_location_links_pair_id_tenant_id_fkey" FOREIGN KEY ("pair_id", "tenant_id")
    REFERENCES "shopify_location_pairs" ("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- ── 5 · LE SEDI: la stessa falla, e una distinzione da preservare ───────────
--
-- ⚠️ La verifica chiesta il 07/09/2026: si', la stessa possibilita' di
--    cancellare la storia riguardava anche le sedi. Cancellando i PERIODI la
--    coppia tornava cancellabile, e con essa il GID di location tornava
--    riassegnabile.
--
-- ⭐ Ma qui la distinzione decisa in §1.13.6 va PRESERVATA, e il divieto sta
--    quindi SOLO sui periodi:
--
--      coppia CON periodi   la storia esiste -> i periodi non si cancellano, e
--                           la FK RESTRICT impedisce di cancellare la coppia
--      coppia SENZA periodi nessuna storia, nessun effetto -> si cancella, ed e'
--                           la correzione dell'abbinamento iniziale errato
--
-- ⛔ E' la differenza fra sedi e articoli, e ha una ragione: un abbinamento di
--    sede LO DICHIARA UNA PERSONA e puo' sbagliare; un'identita' di articolo
--    nasce da un'operazione tecnica — un'importazione o una creazione remota
--    riuscita — quindi non c'e' un errore di abbinamento umano da correggere.

CREATE TRIGGER "shopify_location_links_mai_delete"
  BEFORE DELETE ON "shopify_location_links"
  FOR EACH ROW EXECUTE FUNCTION "shopify_storico_non_si_cancella"();
CREATE TRIGGER "shopify_location_links_mai_truncate"
  BEFORE TRUNCATE ON "shopify_location_links"
  FOR EACH STATEMENT EXECUTE FUNCTION "shopify_storico_non_si_cancella"();

-- ⚠️ NESSUN trigger su `shopify_location_pairs`: una coppia senza periodi resta
--    cancellabile, ed e' la correzione iniziale che §1.13.6 consente.