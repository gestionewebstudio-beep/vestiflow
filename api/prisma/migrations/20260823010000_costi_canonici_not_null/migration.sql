-- Un costo canonico non e' mai NULL: se non e' valorizzato, vale ZERO.
--
-- ── LA DECISIONE ───────────────────────────────────────────────────────────
--
-- Fino a oggi le colonne di costo erano nullable, e il codice attribuiva al
-- NULL un significato proprio: «costo sconosciuto», distinto da «costa zero».
-- Su quella distinzione erano costruiti un ramo del margine, una metrica di
-- copertura (`costCoveragePercent`) e tre messaggi in dashboard.
--
-- Il proprietario l'ha rimossa il 22/08/2026: per il dominio costo i due casi
-- sono lo stesso caso, e il valore persistito e' 0. Il codice applicativo e'
-- stato adeguato PRIMA di questa migration — nessun writer produce piu' NULL.
--
-- ⚠️ **`null` resta legittimo nei DTO**, ma con un solo significato: costo non
-- visibile a chi non ha «Visualizza costi d'acquisto». Quel NULL non nasce da
-- una colonna, lo mette il servizio nella risposta, e non e' toccato da qui.
--
-- ── COSA NON ENTRA ─────────────────────────────────────────────────────────
--
-- I costi opzionali di `document_lines` — `entered_unit_cost`, `unit_cost_net`,
-- `unit_cost_gross`, `unit_vat_amount` — restano NULLABLE per decisione
-- esplicita: quella e' una struttura condivisa da tipi documento che il costo
-- non lo gestiscono affatto, e li' l'assenza della proprieta' ha un significato
-- tecnico proprio.
--
-- `supplier_order_lines.unit_cost_minor` era gia' NOT NULL: e' il precedente
-- che conferma la direzione.
--
-- ── BACKFILL ───────────────────────────────────────────────────────────────
--
-- I dati presenti sono esclusivamente di sviluppo e non serve preservarne la
-- semantica storica (decisione del proprietario, 22/08/2026). Si azzera.
--
-- L'unica ricostruzione che si fa e' quella immediata: dove il costo unitario
-- c'e' e manca solo il totale, il totale E' unitario x quantita' — e' la
-- definizione della colonna, non un'ipotesi sullo storico.
--
-- ── COSTO FISICO ───────────────────────────────────────────────────────────
--
-- Le colonne hanno gia' il tipo giusto: `SET DEFAULT` e' metadato, `SET NOT
-- NULL` e' una SCANSIONE (non una riscrittura) sotto ACCESS EXCLUSIVE, e
-- l'UPDATE tocca solo le righe con NULL. Molto piu' leggero della migration
-- `20260822170412_purchase_costs_six_decimals`, che cambiava il tipo.

-- ── 1. Backfill dei costi canonici ─────────────────────────────────────────

UPDATE "products"
  SET "purchase_price_minor" = 0
  WHERE "purchase_price_minor" IS NULL;

UPDATE "product_variants"
  SET "purchase_price_minor" = 0
  WHERE "purchase_price_minor" IS NULL;

UPDATE "supplier_variant_links"
  SET "last_purchase_price_minor" = 0
  WHERE "last_purchase_price_minor" IS NULL;

UPDATE "stock_movements"
  SET "unit_cost_minor" = 0
  WHERE "unit_cost_minor" IS NULL;

-- Totale del movimento: dove l'unitario c'e', il totale si ricava da lui.
UPDATE "stock_movements"
  SET "total_cost_minor" = round("unit_cost_minor" * "quantity")
  WHERE "total_cost_minor" IS NULL AND "unit_cost_minor" IS NOT NULL;

UPDATE "stock_movements"
  SET "total_cost_minor" = 0
  WHERE "total_cost_minor" IS NULL;

-- ── 2. Il vincolo ──────────────────────────────────────────────────────────

ALTER TABLE "products"
  ALTER COLUMN "purchase_price_minor" SET DEFAULT 0,
  ALTER COLUMN "purchase_price_minor" SET NOT NULL;

ALTER TABLE "product_variants"
  ALTER COLUMN "purchase_price_minor" SET DEFAULT 0,
  ALTER COLUMN "purchase_price_minor" SET NOT NULL;

ALTER TABLE "supplier_variant_links"
  ALTER COLUMN "last_purchase_price_minor" SET DEFAULT 0,
  ALTER COLUMN "last_purchase_price_minor" SET NOT NULL;

ALTER TABLE "stock_movements"
  ALTER COLUMN "unit_cost_minor" SET DEFAULT 0,
  ALTER COLUMN "unit_cost_minor" SET NOT NULL;

ALTER TABLE "stock_movements"
  ALTER COLUMN "total_cost_minor" SET DEFAULT 0,
  ALTER COLUMN "total_cost_minor" SET NOT NULL;
