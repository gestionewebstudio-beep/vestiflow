-- Sconto extra di documento sull'ordine fornitore.
--
-- PERCHÉ: era l'unico dei documenti a non averlo. `Document` (arrivo merce e
-- i suoi quattro fratelli) e `SalesOrder` hanno `document_discount_percent` da
-- tempo; l'ordine fornitore no, e non per una ragione scritta da qualche parte:
-- uno sconto di chiusura su un ordine al fornitore è pratica comune. Verificato
-- l'11/08/2026 confrontando le tre maschere documento.
--
-- Il calcolo NON cambia: `computeGoodsReceiptTotals` accetta già lo sconto
-- documento come secondo argomento, e l'ordine fornitore glielo passava a zero
-- fisso. Qui si aggiunge solo il posto dove quel numero vive.
--
-- FORMA: identica agli altri due — NUMERIC(7,4), default 0. La coda decimale
-- serve a percentuali come 2,5%: arrotondarla cambierebbe il totale.
--
-- SCRITTA A MANO (regole-qualita): su questo database condiviso `migrate dev` e
-- `migrate diff --from-schema-datasource` propongono di cancellare le tabelle
-- degli altri rami. Timestamp verificato libero prima di crearla.

ALTER TABLE "supplier_orders"
  ADD COLUMN IF NOT EXISTS "document_discount_percent" NUMERIC(7,4) NOT NULL DEFAULT 0;
