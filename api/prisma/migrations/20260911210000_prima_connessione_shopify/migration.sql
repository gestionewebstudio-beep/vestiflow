-- La PRIMA CONNESSIONE Shopify come percorso persistito (docs/27, docs/24 §12.-1).
--
-- Due tabelle nuove, nessuna colonna toccata altrove:
--
--   shopify_setups             UNA riga per tenant: direzione scelta, fase, anteprima
--                              salvata, esito del trasferimento, date, confine ordini
--   shopify_location_choices   UNA riga per (tenant, location Shopify): la scelta
--                              dell'operatore — collega / crea / lascia — e la sede
--
-- ⚠️ Nessuna riga in `shopify_setups` = percorso mai iniziato, e NON «già attivo»:
--    le connessioni nate prima non vengono spinte dentro (risposta 4, 11/09/2026).
--    Questa migration non scrive righe e non contatta Shopify.
--
-- ⚠️ `shopify_location_choices` sopravvive al percorso: «lascia» è una scelta che
--    va conservata, o la location tornerebbe «da decidere» a ogni lettura; «collega»
--    e «crea» scrivono anche coppia e periodo nello storico delle sedi (B7), che
--    resta la fonte del collegamento.
--
-- ⛔ Scritta a mano, provata con `prisma:deploy:test` sul solo database di prova.

CREATE TYPE "ShopifySetupDirection" AS ENUM ('shopify_to_vestiflow', 'vestiflow_to_shopify');

CREATE TYPE "ShopifySetupStatus" AS ENUM (
  'scelte', 'sedi', 'controllo', 'trasferimento', 'interrotto', 'trasferito', 'attivato'
);

CREATE TYPE "ShopifyLocationChoiceKind" AS ENUM ('collega', 'crea', 'lascia');

CREATE TABLE "shopify_setups" (
  "id"                   UUID NOT NULL,
  "tenant_id"            UUID NOT NULL,
  "status"               "ShopifySetupStatus" NOT NULL DEFAULT 'scelte',
  "direction"            "ShopifySetupDirection",
  "anteprima"            JSONB,
  "anteprima_at"         TIMESTAMP(3),
  "esito"                JSONB,
  "correlation_id"       UUID,
  "confirmed_at"         TIMESTAMP(3),
  "transfer_started_at"  TIMESTAMP(3),
  "transfer_finished_at" TIMESTAMP(3),
  "activated_at"         TIMESTAMP(3),
  "orders_since"         TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "shopify_setups_pkey" PRIMARY KEY ("id"),
  -- Un percorso confermato ha una direzione: la conferma senza direzione non
  -- esiste, e il CHECK lo dice al database, non solo al servizio.
  CONSTRAINT "shopify_setups_direzione_alla_conferma" CHECK (
    "confirmed_at" IS NULL OR "direction" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "shopify_setups_tenant_id_key" ON "shopify_setups" ("tenant_id");

ALTER TABLE "shopify_setups"
  ADD CONSTRAINT "shopify_setups_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shopify_setups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_setups" FROM PUBLIC, anon, authenticated;

CREATE TABLE "shopify_location_choices" (
  "id"                    UUID NOT NULL,
  "tenant_id"             UUID NOT NULL,
  "shopify_location_id"   TEXT NOT NULL,
  "shopify_location_name" TEXT NOT NULL,
  "choice"                "ShopifyLocationChoiceKind" NOT NULL,
  "location_id"           UUID,
  "decided_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "shopify_location_choices_pkey" PRIMARY KEY ("id"),
  -- L'id della location Shopify è numerico e normalizzato (senza prefisso GID):
  -- è la forma con cui `locations.shopify_location_id` viene confrontata.
  CONSTRAINT "shopify_location_choices_id_forma" CHECK ("shopify_location_id" ~ '^[0-9]+$'),
  -- «collega» e «crea» hanno una sede; «lascia» non ne ha. Il contrario è un errore.
  CONSTRAINT "shopify_location_choices_sede_per_scelta" CHECK (
    ("choice" = 'lascia' AND "location_id" IS NULL)
    OR ("choice" <> 'lascia' AND "location_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "shopify_location_choices_tenant_id_shopify_location_id_key"
  ON "shopify_location_choices" ("tenant_id", "shopify_location_id");
CREATE INDEX "shopify_location_choices_tenant_id_location_id_idx"
  ON "shopify_location_choices" ("tenant_id", "location_id");

ALTER TABLE "shopify_location_choices"
  ADD CONSTRAINT "shopify_location_choices_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- FK composita col tenant: la sede scelta è dello stesso tenant, per costruzione.
  -- CASCADE e non SET NULL: col CHECK qui sopra un NULL su «collega» sarebbe una
  -- violazione, e una sede eliminata (possibile solo senza coppia, che è RESTRICT)
  -- riporta la location Shopify a «da decidere» — che è la lettura giusta.
  ADD CONSTRAINT "shopify_location_choices_location_id_tenant_id_fkey"
    FOREIGN KEY ("location_id", "tenant_id")
    REFERENCES "locations" ("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shopify_location_choices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shopify_location_choices" FROM PUBLIC, anon, authenticated;
