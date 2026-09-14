-- Le SPEDIZIONI degli ordini online — deciso dal proprietario il 12/09/2026.
--
-- ⭐ PERCHE'. Magazzino e rappresentazione commerciale dell'ordine sono due cose:
--    ogni quantita' effettivamente spedita scarica la sede corretta QUANDO si
--    acquisisce quell'evasione, anche a ordine incompleto; la parte ancora da
--    spedire conserva l'impegno; una stessa riga d'ordine puo' avere piu' uscite
--    (spedizioni successive, sedi diverse). Il vincolo «un movimento per riga»
--    (`stock_movements` UNIQUE su source_document_type + source_line_id) non
--    deve impedire di rappresentarle: qui ogni riga di spedizione e' un effetto
--    identificabile, applicato UNA volta, col SUO movimento.
--
--   sales_order_shipments        UNA riga per (tenant, ordine, id evasione remota):
--                                la sede risolta dal collegamento esplicito, la
--                                location remota, la data
--   sales_order_shipment_lines   UNA riga per (spedizione, riga d'ordine): quantita'
--                                uscita, esito, e il movimento quando applicato
--
-- ⛔ NON e' un documento: la Vendita online resta UNA per ordine, a completamento,
--    e ADOTTA i movimenti delle spedizioni (aggiorna i loro riferimenti) invece di
--    crearne altri. Nessun corrispettivo per spedizione.
--
-- ⚠️ `location_id` senza FK, come `online_sale_lines.location_id`: e' la fotografia
--    della sede dello scarico; il vincolo sulla sede lo porta gia' il movimento.
--
-- ⛔ Scritta a mano, provata con `prisma:deploy:test` sul solo database di prova.

CREATE TYPE "ShipmentLineOutcome" AS ENUM ('scaricata', 'senza_sede', 'senza_impegno', 'senza_variante');

CREATE TABLE "sales_order_shipments" (
  "id"                      UUID NOT NULL,
  "tenant_id"               UUID NOT NULL,
  "sales_order_id"          UUID NOT NULL,
  "external_fulfillment_id" TEXT NOT NULL,
  "shopify_location_id"     TEXT,
  "location_id"             UUID,
  "shipped_at"              TIMESTAMP(3) NOT NULL,
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sales_order_shipments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_order_shipments_tenant_id_sales_order_id_external_fulfillment_id_key"
  ON "sales_order_shipments" ("tenant_id", "sales_order_id", "external_fulfillment_id");
CREATE INDEX "sales_order_shipments_sales_order_id_idx" ON "sales_order_shipments" ("sales_order_id");

ALTER TABLE "sales_order_shipments"
  ADD CONSTRAINT "sales_order_shipments_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Un ordine con spedizioni acquisite ha effetti fisici: non si elimina.
  ADD CONSTRAINT "sales_order_shipments_sales_order_id_fkey" FOREIGN KEY ("sales_order_id")
    REFERENCES "sales_orders" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_shipments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "sales_order_shipments" FROM PUBLIC, anon, authenticated;

CREATE TABLE "sales_order_shipment_lines" (
  "id"                  UUID NOT NULL,
  "tenant_id"           UUID NOT NULL,
  "shipment_id"         UUID NOT NULL,
  "sales_order_line_id" UUID NOT NULL,
  "variant_id"          UUID,
  "sku"                 TEXT NOT NULL,
  "quantity"            INTEGER NOT NULL,
  "esito"               "ShipmentLineOutcome" NOT NULL,
  "stock_movement_id"   UUID,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sales_order_shipment_lines_pkey" PRIMARY KEY ("id"),
  -- Una quantita' uscita e' positiva: lo zero non e' una spedizione.
  CONSTRAINT "sales_order_shipment_lines_quantita_positiva" CHECK ("quantity" > 0),
  -- Scaricata ⇔ ha il suo movimento: l'esito e l'effetto non divergono.
  CONSTRAINT "sales_order_shipment_lines_scaricata_con_movimento" CHECK (
    ("esito" = 'scaricata') = ("stock_movement_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "sales_order_shipment_lines_shipment_id_sales_order_line_id_key"
  ON "sales_order_shipment_lines" ("shipment_id", "sales_order_line_id");
CREATE UNIQUE INDEX "sales_order_shipment_lines_stock_movement_id_key"
  ON "sales_order_shipment_lines" ("stock_movement_id");
CREATE INDEX "sales_order_shipment_lines_sales_order_line_id_idx"
  ON "sales_order_shipment_lines" ("sales_order_line_id");
CREATE INDEX "sales_order_shipment_lines_tenant_id_idx" ON "sales_order_shipment_lines" ("tenant_id");

ALTER TABLE "sales_order_shipment_lines"
  ADD CONSTRAINT "sales_order_shipment_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "sales_order_shipment_lines_shipment_id_fkey" FOREIGN KEY ("shipment_id")
    REFERENCES "sales_order_shipments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Una riga d'ordine spedita non sparisce: l'uscita e' avvenuta.
  ADD CONSTRAINT "sales_order_shipment_lines_sales_order_line_id_fkey" FOREIGN KEY ("sales_order_line_id")
    REFERENCES "sales_order_lines" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "sales_order_shipment_lines_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id")
    REFERENCES "stock_movements" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_shipment_lines" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "sales_order_shipment_lines" FROM PUBLIC, anon, authenticated;
