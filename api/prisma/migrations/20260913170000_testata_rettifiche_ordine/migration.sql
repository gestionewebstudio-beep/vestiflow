-- La testata dell'ordine porta la SOMMA delle rettifiche e il TOTALE AGGIORNATO.
--
-- ⭐ PERCHE'. L'elenco Ordini e' paginato sul server, quindi una colonna si ordina
--    solo se il database sa ordinarla. «Rettifiche» e' la somma dei rimborsi
--    (`sales_order_refunds.total_minor`) e «Tot. aggiornato» la differenza dal
--    totale: nessuna delle due e' una colonna, e Prisma non ordina per una somma.
--    Segnalato dal proprietario il 13/09/2026 sull'elenco Ordini Shopify: «Non ha
--    ordinamento».
--
--   refund_total_minor    la somma delle rettifiche, scritta dove si scrivono i
--                         rimborsi (persistRefunds): la testata somma le proprie
--                         righe, come total_minor. Riempita qui per gli ordini gia'
--                         presenti.
--   current_total_minor   GENERATA dal database (total_minor − refund_total_minor):
--                         una fonte sola, non si scrive, non puo' restare indietro se
--                         un aggiornamento dell'ordine cambia total_minor.
--
-- ⛔ Il valore originario (total_minor) non cambia: la rettifica resta separata
--    (proprietario, 13/09/2026, #1014: 2.249,85 − 749,95 = 1.499,90).
--
-- ⛔ Scritta a mano, provata con `prisma:deploy:test` e `prisma:deploy:collaudo`.

ALTER TABLE "sales_orders"
  ADD COLUMN "refund_total_minor" INTEGER NOT NULL DEFAULT 0;

UPDATE "sales_orders" o
SET "refund_total_minor" = r."somma"
FROM (
  SELECT "sales_order_id", COALESCE(SUM("total_minor"), 0) AS "somma"
  FROM "sales_order_refunds"
  GROUP BY "sales_order_id"
) r
WHERE r."sales_order_id" = o."id";

ALTER TABLE "sales_orders"
  ADD COLUMN "current_total_minor" INTEGER
  GENERATED ALWAYS AS ("total_minor" - "refund_total_minor") STORED;
