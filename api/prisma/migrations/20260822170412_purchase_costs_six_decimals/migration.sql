-- Sei decimali di EURO sul costo unitario.
--
--   integer  ->  numeric(16,6)
--
-- ⚠️ **La scala 6 e' sul valore in CENTESIMI, non in euro**, ed e' la fonte di
-- ambiguita' da chiarire una volta per tutte:
--
--     1,234567 EUR  =  123,4567 centesimi
--
--     scala SQL      numeric(16,6)  ->  6 decimali di centesimo (8 di euro)
--     contratto app  MINOR_TAIL_DECIMALS = 4  ->  4 di centesimo (6 di euro)
--
-- Il contratto ne usa 4 e la colonna ne ospita 6: due cifre di margine. La
-- scala 6 NON e' scelta qui — e' quella delle sette colonne di prezzo gia'
-- portate a NUMERIC(16,6) dalla migration `20260803220000_prices_six_decimals`,
-- e mescolare scale diverse sulla stessa grandezza sarebbe peggio del margine.
--
-- ── PERCHE' ────────────────────────────────────────────────────────────────
--
-- Quella migration escluse deliberatamente il costo, con questa motivazione:
-- «il costo resta intero: non si digita mai ivato in anagrafica, e dai carichi
-- arriva gia' netto».
--
-- La seconda meta' oggi e' FALSA. L'Arrivo merce ha `costEntryMode`: il costo
-- si digita IVATO, e lo scorporo produce la coda — 25,00 ivati al 22% valgono
-- 2049,180328 centesimi netti. Con la colonna intera quella coda si perde, e
-- rimostrando il costo ivato torna 24,99.
--
-- ── COSA NON ENTRA, E PERCHE' ──────────────────────────────────────────────
--
-- Si allargano SOLO le colonne che contengono un costo UNITARIO. I TOTALI
-- restano interi: sono il risultato gia' arrotondato, e l'arrotondamento sta
-- sul totale di riga, mai sul valore unitario che lo compone.
--
--     unitario  ->  numeric(16,6)   puo' nascere da uno scorporo
--     totale    ->  integer         l'uscita e' gia' avvenuta
--
-- Percio' `stock_movements.total_cost_minor` NON e' qui: e'
-- `unit_cost_minor * quantity`, cioe' un totale di riga movimento.
--
-- ── COSTO FISICO ───────────────────────────────────────────────────────────
--
-- ⚠️ **NON e' una modifica gratuita.** In PostgreSQL `integer -> numeric` non e'
-- una conversione binary-coercible: il cambio di tipo comporta di norma la
-- RISCRITTURA della tabella e la ricostruzione degli indici, con un ACCESS
-- EXCLUSIVE lock per la durata.
--
--   dati      i valori interi esistenti sono rappresentabili esattamente in
--             numeric: 1234 diventa 1234.000000, nessuna perdita
--   tempo     proporzionale alle righe della tabella, NON trascurabile a
--             priori. Su questo database di sviluppo e' ininfluente; su
--             `stock_movements` in un tenant maturo va misurato prima
--
-- Chi applichera' questa migration su dati veri misuri `count(*)` sulle quattro
-- tabelle e scelga la finestra. Qui c'era scritto «nessuna riga si riscrive»:
-- era sbagliato, ed e' il tipo di frase che rende innocua una modifica che non
-- lo e'.
--
-- ── A SCHERMO ──────────────────────────────────────────────────────────────
--
-- Si continuano a mostrare 2 decimali ovunque: l'arrotondamento avviene
-- all'uscita (stampa, CSV, payload di canale), mai qui.

-- Costo d'acquisto dell'articolo: seed di nascita, mai riscritto dai carichi.
ALTER TABLE "products"
  ALTER COLUMN "purchase_price_minor" TYPE NUMERIC(16, 6);

-- Costo d'acquisto della variante: e' il valore che l'Arrivo merce aggiorna
-- quando la spunta di riga e' accesa, ed e' il primo a ricevere la coda.
ALTER TABLE "product_variants"
  ALTER COLUMN "purchase_price_minor" TYPE NUMERIC(16, 6);

-- Ultimo costo d'acquisto per fornitore: stessa origine, stessa scrittura.
ALTER TABLE "supplier_variant_links"
  ALTER COLUMN "last_purchase_price_minor" TYPE NUMERIC(16, 6);

-- Costo unitario congelato sul movimento: la fotografia del costo al momento
-- dell'uscita, e deve conservare quello che l'anagrafica conserva.
-- ⛔ `total_cost_minor` resta INTEGER: vedi sopra.
ALTER TABLE "stock_movements"
  ALTER COLUMN "unit_cost_minor" TYPE NUMERIC(16, 6);
