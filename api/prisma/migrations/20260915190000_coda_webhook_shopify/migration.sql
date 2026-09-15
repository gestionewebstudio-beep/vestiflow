-- La CODA delle notifiche webhook Shopify (docs/30 §7.1, §7.1.1, §7.1.2 — 15/09/2026).
--
-- ⭐ PERCHE'. Fino a qui il controller rispondeva a Shopify DOPO l'elaborazione:
--    un'elaborazione lenta superava i 5 s concessi (Shopify ritenta 8 volte in
--    4 h, poi CANCELLA la sottoscrizione), e la stessa consegna arrivata due
--    volte veniva elaborata due volte — riprodotto in `shopify-webhooks.controller.spec`.
--    Qui la consegna diventa DUREVOLE prima della risposta: `200` solo dopo il
--    commit della ricevuta; l'elaborazione avviene fuori dalla richiesta.
--
--    - shopify_webhook_receipts  una riga per consegna accolta, unica per
--                                (shop_domain, webhook_id): il doppione e' la
--                                stessa riga. Tenant e negozio VERIFICATI
--                                all'accoglienza; all'elaborazione si
--                                ricontrollano (un'associazione cambiata non
--                                applica). `risorsa` conserva l'ordine per
--                                risorsa, non per negozio; NULL = non
--                                risolvibile: non scavalca e non e' scavalcata.
--    - shopify_webhook_lanes     la corsia: una riga per tenant, rivendicata con
--                                un numero di versione (lo schema del claim di
--                                creazione, migration 20260915120000). La
--                                scadenza permette di riprendere, non dimostra
--                                che il lavoratore precedente sia morto.
--
-- ⚠️ Le chiavi esterne ci sono dal primo giorno, con cascata dal tenant: il
--    troncamento della fixture, la cancellazione del tenant e la purga del
--    ripristino raggiungono queste tabelle. La tabella degli stati sync senza
--    FK (20260713140000) e' costata una giornata di diagnosi (docs/30 §9).

CREATE TYPE "ShopifyWebhookReceiptEsito" AS ENUM (
  'in_coda',
  'in_lavorazione',
  'elaborata',
  'fallita',
  'scartata_sync_spenta',
  'scartata_topic',
  'scartata_associazione_cambiata',
  'sospesa_dopo_ripristino'
);

CREATE TABLE "shopify_webhook_receipts" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"            UUID NOT NULL,
  "shop_id"              UUID,
  "shop_domain"          TEXT NOT NULL,
  "webhook_id"           TEXT NOT NULL,
  "topic"                TEXT NOT NULL,
  "risorsa"              TEXT,
  "triggered_at"         TIMESTAMP(3),
  "api_version"          TEXT,
  "payload"              JSONB NOT NULL,
  "received_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at"         TIMESTAMP(3),
  "esito"                "ShopifyWebhookReceiptEsito" NOT NULL DEFAULT 'in_coda',
  "tentativi"            INTEGER NOT NULL DEFAULT 0,
  "ultimo_errore"        TEXT,
  "next_attempt_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lavorata_da_versione" INTEGER,

  CONSTRAINT "shopify_webhook_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shopify_webhook_receipts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shopify_webhook_receipts_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shopify_shops"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "shopify_webhook_receipts_shop_domain_webhook_id_key"
  ON "shopify_webhook_receipts"("shop_domain", "webhook_id");
CREATE INDEX "shopify_webhook_receipts_tenant_id_esito_next_attempt_at_idx"
  ON "shopify_webhook_receipts"("tenant_id", "esito", "next_attempt_at");
CREATE INDEX "shopify_webhook_receipts_tenant_id_risorsa_received_at_idx"
  ON "shopify_webhook_receipts"("tenant_id", "risorsa", "received_at");

CREATE TABLE "shopify_webhook_lanes" (
  "tenant_id"     UUID NOT NULL,
  "claimed_by"    TEXT,
  "claimed_at"    TIMESTAMP(3),
  "claim_version" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "shopify_webhook_lanes_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "shopify_webhook_lanes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- regole-sicurezza: RLS e revoca sulla Data API, come ogni tabella di business.
ALTER TABLE "shopify_webhook_receipts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_webhook_receipts" FROM anon, authenticated;
ALTER TABLE "shopify_webhook_lanes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_webhook_lanes" FROM anon, authenticated;
