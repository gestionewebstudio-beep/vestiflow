-- L'ORDINE DI ARRIVO delle ricevute webhook (docs/30 §7.1.2, decisione 1 — 15/09/2026).
--
-- ⛔ PERCHE'. L'ordine per risorsa era su `received_at` con l'id come spareggio: due
--    consegne della stessa risorsa nello STESSO millisecondo (un burst di Shopify:
--    orders/create e orders/updated insieme) si ordinavano per un uuid casuale,
--    cioe' a caso — riprodotto nella prova A11 della coda. Un progressivo assegnato
--    dal database all'inserimento e' l'ordine di arrivo vero, e non ha pari.
ALTER TABLE "shopify_webhook_receipts"
  ADD COLUMN "arrivo" BIGINT GENERATED ALWAYS AS IDENTITY;

CREATE UNIQUE INDEX "shopify_webhook_receipts_arrivo_key" ON "shopify_webhook_receipts"("arrivo");
