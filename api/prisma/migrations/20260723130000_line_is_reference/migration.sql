-- Riga «documento collegato»: separatore informativo del gruppo di righe
-- arrivate da un altro documento (es. il preventivo incluso in un ordine).
-- Non porta quantità né valori e resta fuori dai totali.
--
-- Non distruttiva: colonna con default false, le righe già esistenti restano
-- righe normali (nessun recupero retroattivo, come da indicazione).

ALTER TABLE "document_lines"
  ADD COLUMN "is_reference" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sales_order_lines"
  ADD COLUMN "is_reference" BOOLEAN NOT NULL DEFAULT false;
