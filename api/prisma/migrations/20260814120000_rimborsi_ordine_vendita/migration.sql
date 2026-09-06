-- Rettifica economica di un ordine di vendita: quanto è stato reso, e quando.
-- (specifica 08 «Resi e annullamenti dal canale», §4)
--
-- PERCHÉ UNA TABELLA E NON UN CAMPO SULL'ORDINE
-- Il registro corrispettivi somma i totali dell'ordine e oggi non sottrae
-- nulla: un reso lascia il corrispettivo intatto, e `refundsCount` conta gli
-- ordini rimborsati senza toccare gli importi. L'informazione economica del
-- rimborso — importo, imposta, data — arriva nel payload Shopify
-- (`refunds[].refund_line_items[].subtotal` e `.total_tax`) e oggi si butta.
--
-- Non basta rileggere l'ordine: Shopify espone anche i totali `current_*` già
-- al netto dei rimborsi, ma scriverli sull'ordine ridurrebbe ALL'INDIETRO il
-- corrispettivo del giorno della vendita. Il registro di quel giorno deve
-- continuare a dire quanto fu incassato; il reso è una rettifica del giorno in
-- cui avviene (Ris. 274/E/2009). Da qui una riga datata a sé.
--
-- IDEMPOTENZA
-- Lo stesso ordine torna a ogni webhook, coi rimborsi già visti dentro:
-- l'unicità (tenant, id rimborso del canale) è ciò che impedisce di contare
-- due volte la stessa rettifica.
--
-- CONVENZIONE IMPORTI
-- Unità minori, stessa convenzione di `sales_orders`, così il registro
-- sottrae come somma senza conversioni: su store a prezzi ivati
-- `subtotal_minor` è lordo e `tax_minor` è l'imposta contenuta.
CREATE TABLE "sales_order_refunds" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "external_refund_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
  "tax_minor" INTEGER NOT NULL DEFAULT 0,
  "shipping_minor" INTEGER NOT NULL DEFAULT 0,
  "total_minor" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_order_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_order_refunds_tenant_external_key"
  ON "sales_order_refunds"("tenant_id", "external_refund_id");
CREATE INDEX "sales_order_refunds_tenant_occurred_idx"
  ON "sales_order_refunds"("tenant_id", "occurred_at" DESC);
CREATE INDEX "sales_order_refunds_order_idx"
  ON "sales_order_refunds"("sales_order_id");

-- Sicurezza (regole-sicurezza): RLS abilitata + REVOKE nella stessa migration.
-- L'API si connette come owner (bypassa RLS); la anon/authenticated key no.
ALTER TABLE "sales_order_refunds" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "sales_order_refunds" FROM anon, authenticated;

ALTER TABLE "sales_order_refunds"
  ADD CONSTRAINT "sales_order_refunds_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_order_refunds"
  ADD CONSTRAINT "sales_order_refunds_sales_order_id_fkey"
  FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
