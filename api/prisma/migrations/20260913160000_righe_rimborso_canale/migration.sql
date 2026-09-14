-- Le RIGHE RIMBORSATE dal canale — per quantità, non solo per denaro.
--
-- ⭐ PERCHE'. `sales_order_refunds` porta il denaro di ogni rettifica; le righe
--    (`refund_line_items[]`) dicevano QUANTI pezzi e con quale gesto
--    (`restock_type`: `cancel` annullati prima della spedizione, `return` rientrati,
--    `no_restock` solo denaro) e non si conservavano. Le quantita' ANNULLATE si
--    ricavavano allora solo per differenza — «ordinate − spedite» — che e' sbagliato
--    durante un'evasione parziale: il residuo puo' essere ancora da spedire.
--    Deciso dal proprietario il 13/09/2026 sull'ordine #1014 del collaudo reale:
--    «gli annullati si ricavano dai dati di cancellazione».
--
--   sales_order_refund_lines   UNA riga per (rimborso, riga remota): quantita',
--                              restock_type, importi dichiarati dal canale; la
--                              riga d'ordine risolta dall'id remoto (nulla se
--                              la riga non c'e' piu': la rettifica resta).
--
-- ⛔ Nessun valore originario cambia: la riga d'ordine e la Vendita online restano
--    come ORDINATE; questa tabella porta la rettifica, con la sua data.
--
-- ⛔ Scritta a mano, provata con `prisma:deploy:test` e `prisma:deploy:collaudo`.

CREATE TABLE "sales_order_refund_lines" (
  "id"                  UUID NOT NULL,
  "tenant_id"           UUID NOT NULL,
  "refund_id"           UUID NOT NULL,
  "sales_order_line_id" UUID,
  "external_line_id"    TEXT NOT NULL,
  "quantity"            INTEGER NOT NULL,
  "restock_type"        TEXT NOT NULL,
  "subtotal_minor"      INTEGER NOT NULL DEFAULT 0,
  "tax_minor"           INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "sales_order_refund_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_order_refund_lines_refund_id_external_line_id_key"
  ON "sales_order_refund_lines" ("refund_id", "external_line_id");
CREATE INDEX "sales_order_refund_lines_sales_order_line_id_idx"
  ON "sales_order_refund_lines" ("sales_order_line_id");

ALTER TABLE "sales_order_refund_lines"
  ADD CONSTRAINT "sales_order_refund_lines_refund_id_fkey" FOREIGN KEY ("refund_id")
    REFERENCES "sales_order_refunds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- La riga d'ordine puo' sparire (ordine rimosso): la rettifica resta, senza riga.
  ADD CONSTRAINT "sales_order_refund_lines_sales_order_line_id_fkey" FOREIGN KEY ("sales_order_line_id")
    REFERENCES "sales_order_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sales_order_refund_lines" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "sales_order_refund_lines" FROM PUBLIC, anon, authenticated;
