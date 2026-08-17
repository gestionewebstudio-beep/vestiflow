-- Ordine cliente: prezzo unitario a sei decimali e modalità netto/ivato persistita.
--
-- PERCHÉ IL TIPO CAMBIA
-- `sales_order_lines.unit_price_minor` era `integer`, quindi non poteva ospitare la
-- coda decimale che nasce da uno scorporo: 25,00 ivati al 22% valgono 2049,180328
-- centesimi netti, e su un intero diventano 2049 — che rimostrati ivati fanno 24,99.
-- Un prezzo ivato su cinque non torna (1.947 su 9.901 fra 1 e 100 € al 22%).
-- La regola del denaro (regole-gestionale, «La colonna è una, i comportamenti sono
-- tanti») dice che ogni prezzo o costo UNITARIO è numeric(16,6) proprio per questo:
-- `document_lines.unit_price_minor` e `supplier_order_lines` ci sono già, questa era
-- rimasta indietro. I totali restano interi: si arrotonda all'uscita, e lì l'uscita
-- è già avvenuta.
--
-- La conversione integer → numeric(16,6) è SENZA PERDITA: ogni intero è un decimale
-- con coda zero. Nessun valore economico cambia.
--
-- PERCHÉ NASCE LA COLONNA `prices_include_vat`
-- La modalità con cui i prezzi sono stati digitati era, per l'Ordine cliente, niente:
-- la maschera non ha mai avuto il selettore (escluso nel template «finché non arriva
-- il supporto backend dedicato» — è questo). Accendendolo, la modalità deve vivere
-- SULL'ORDINE come vive sul documento: se fosse una preferenza dell'operatore, due
-- persone vedrebbero lo stesso ordine in due modi e riaprendolo non si saprebbe come
-- era stato compilato.
--
-- DEFAULT `false` PER LO STORICO — è un fatto, non una supposizione.
-- Il selettore non è mai esistito su questa maschera, quindi nessun ordine può
-- contenere un lordo memorizzato come netto: gli imponibili, le imposte e i totali
-- già registrati sono stati tutti calcolati leggendo `unit_price_minor` come netto.
-- La colonna rende esplicita quella lettura e NON ricalcola niente.

ALTER TABLE "sales_order_lines"
  ALTER COLUMN "unit_price_minor" TYPE numeric(16, 6);

ALTER TABLE "sales_orders"
  ADD COLUMN "prices_include_vat" boolean NOT NULL DEFAULT false;
