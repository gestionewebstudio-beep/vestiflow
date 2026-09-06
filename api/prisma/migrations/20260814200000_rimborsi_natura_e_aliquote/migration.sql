-- La rettifica economica dichiara la propria NATURA e la propria scomposizione
-- per aliquota (specifica 08 §4). Migration ADDITIVA: nessuna colonna tolta,
-- nessuna modificata in modo distruttivo.
--
-- PERCHÉ LA NATURA
-- Shopify rappresenta anche l'annullamento pre-evasione come una voce in
-- `refunds[]`, con nota «Ordine annullato» e `restock_type: cancel`. Misurato
-- il 14/08/2026: dei quattro rimborsi arrivati dal negozio di prova, DUE erano
-- annullamenti (110,00 € in tutto). Sottrarli dal registro toglierebbe una
-- vendita che non è mai avvenuta.
--
-- Ma non si scartano in scrittura: sono fatti arrivati dal canale, e domani
-- servono alla tesoreria. Si classificano, e **è il registro a decidere se
-- hanno effetto economico** — non la traduzione a decidere se esistono.
--
-- PERCHÉ LA SCOMPOSIZIONE PER ALIQUOTA
-- Un registro fiscale sottrae nella componente d'imposta giusta. Misurato sullo
-- stesso ordine: un rimborso può contenere una riga al 4% e la spedizione al
-- 22% — un totale unico non saprebbe dire quanto va tolto a ciascuna.
--
-- L'aliquota è NULLABLE di proposito: le rettifiche fuori riga
-- (`refund_discrepancy`, il rimborso di cortesia a importo libero) portano
-- l'importo e non l'aliquota. Shopify stesso avverte che senza righe
-- l'attribuzione d'imposta non è accurata. Una riga senza aliquota resta
-- visibile come tale: attribuirla per indovinello sarebbe peggio.
--
-- PERCHÉ adjustment_minor
-- Prima ogni `order_adjustment` finiva in `shipping_minor`: un rimborso di
-- cortesia da 5,00 € veniva registrato come «spedizione resa». Il totale
-- tornava, il significato no.
CREATE TYPE "sales_order_refund_kind" AS ENUM ('return_with_restock', 'refund_only', 'cancellation');

ALTER TABLE "sales_order_refunds"
  ADD COLUMN "kind" "sales_order_refund_kind" NOT NULL DEFAULT 'refund_only',
  ADD COLUMN "adjustment_minor" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "sales_order_refunds_tenant_kind_occurred_idx"
  ON "sales_order_refunds"("tenant_id", "kind", "occurred_at" DESC);

CREATE TABLE "sales_order_refund_tax_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "refund_id" UUID NOT NULL,
  "rate_percent" NUMERIC(7, 4),
  "taxable_minor" INTEGER NOT NULL DEFAULT 0,
  "tax_minor" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "sales_order_refund_tax_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sales_order_refund_tax_lines_refund_idx"
  ON "sales_order_refund_tax_lines"("refund_id");

-- Sicurezza (regole-sicurezza): RLS abilitata + REVOKE nella stessa migration.
-- L'API si connette come owner (bypassa RLS); la anon/authenticated key no.
ALTER TABLE "sales_order_refund_tax_lines" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "sales_order_refund_tax_lines" FROM anon, authenticated;

ALTER TABLE "sales_order_refund_tax_lines"
  ADD CONSTRAINT "sales_order_refund_tax_lines_refund_id_fkey"
  FOREIGN KEY ("refund_id") REFERENCES "sales_order_refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- I cinque rimborsi già scritti portano importi calcolati con la vecchia
-- formula (spedizione al netto, natura assente). Si cancellano: la prossima
-- sincronizzazione li riscrive dal canale, che è la fonte. Nessun dato
-- dell'operatore va perso — qui non ce n'è.
DELETE FROM "sales_order_refunds";
