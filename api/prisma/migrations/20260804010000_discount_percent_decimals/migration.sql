-- Lo sconto a cascata ha i decimali: «4+10%» vale 13,6% (4%, poi 10% sul
-- residuo), non 14%. La colonna intera lo arrotondava al salvataggio, quindi il
-- documento registrato valeva un po' meno di quello che l'anteprima aveva
-- mostrato all'operatore — che aveva ragione lui.
--
-- NUMERIC(7,4) copre 0..100 con quattro decimali: la cascata di due sconti
-- interi non ne produce mai di più (0,04 x 0,10 = 0,004 → 13,6000).
-- Allargare una colonna non perde dati: gli sconti interi già registrati
-- restano quello che sono.
ALTER TABLE "document_lines"
  ALTER COLUMN "discount_percent" TYPE NUMERIC(7, 4);

ALTER TABLE "documents"
  ALTER COLUMN "document_discount_percent" TYPE NUMERIC(7, 4);

ALTER TABLE "sales_orders"
  ALTER COLUMN "document_discount_percent" TYPE NUMERIC(7, 4);
