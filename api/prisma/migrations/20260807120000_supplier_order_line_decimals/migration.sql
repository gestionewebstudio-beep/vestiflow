-- L'ordine fornitore è il documento in cui il costo si DIGITA: si richiama
-- l'articolo, arriva il costo d'anagrafica, e l'operatore lo cambia — perché
-- propone un costo nuovo al fornitore o perché lo paga di più. Con il selettore
-- su «Costo ivato» quello è un lordo digitato, e il netto che se ne ricava
-- porta una coda decimale: 5,02 ivati al 22% valgono 411,475410 centesimi netti.
--
-- La colonna intera quella coda la tagliava, e il costo rimostrato ivato tornava
-- 5,01. Misurato al 22% fra 1,00 e 50,00: 884 costi su 4901 — il 18% — non
-- tornavano. NUMERIC(16,6) è la stessa forma di document_lines.unit_price_minor,
-- dove la stessa regola vale già.
ALTER TABLE "supplier_order_lines"
  ALTER COLUMN "unit_cost_minor" TYPE NUMERIC(16, 6),
  ALTER COLUMN "entered_unit_cost_minor" TYPE NUMERIC(16, 6);

-- Lo sconto a cascata ha i decimali: «4+10%» vale 13,6% (4%, poi 10% sul
-- residuo), non 14%. La migration 20260804010000 lo sistemò su document_lines,
-- documents e sales_orders — e saltò gli ordini fornitore, che hanno una tabella
-- propria. Sugli acquisti gli sconti a cascata dei fornitori sono la norma,
-- quindi qui la colonna intera fa lo stesso danno: l'ordine registrato varrebbe
-- meno di quello che l'operatore ha letto nell'anteprima.
--
-- NUMERIC(7,4) copre 0..100 con quattro decimali: la cascata di due sconti
-- interi non ne produce mai di più (0,04 x 0,10 = 0,004 → 13,6000).
-- Allargare una colonna non perde dati: gli importi e gli sconti già registrati
-- restano quello che sono.
ALTER TABLE "supplier_order_lines"
  ALTER COLUMN "discount_percent" TYPE NUMERIC(7, 4);
