-- Sei decimali sul prezzo NETTO memorizzato.
--
-- Un prezzo digitato ivato non ha un netto intero: 25,00 al 22% valgono
-- 2049,180328 centesimi. Con la colonna intera quella coda si perdeva, e
-- rimostrando il prezzo ivato tornava 24,99 — su circa un prezzo su cinque ad
-- aliquota ordinaria. Le colonne diventano NUMERIC(16,6), cioè 6 decimali di
-- euro (4 di centesimo): l'errore residuo è nell'ordine del milionesimo, contro
-- il mezzo centesimo che servirebbe per spostare la cifra mostrata.
--
-- A schermo si continuano a mostrare 2 decimali ovunque: l'arrotondamento
-- avviene all'uscita (stampa, CSV, payload di canale), mai qui.
--
-- Il tipo NUMERIC è una conversione ALLARGANTE: i valori interi già presenti
-- restano identici, nessun dato si perde.

-- Articolo: prezzo, prezzo Shopify e i tre listini aggiuntivi.
ALTER TABLE "products"
  ALTER COLUMN "selling_price_minor"  TYPE NUMERIC(16, 6),
  ALTER COLUMN "shopify_price_minor"  TYPE NUMERIC(16, 6),
  ALTER COLUMN "listino1_price_minor" TYPE NUMERIC(16, 6),
  ALTER COLUMN "listino2_price_minor" TYPE NUMERIC(16, 6),
  ALTER COLUMN "listino3_price_minor" TYPE NUMERIC(16, 6);

-- Variante: prezzo e prezzo Shopify per taglia (il costo resta intero: non si
-- digita mai ivato in anagrafica, e dai carichi arriva già netto).
ALTER TABLE "product_variants"
  ALTER COLUMN "selling_price_minor" TYPE NUMERIC(16, 6),
  ALTER COLUMN "shopify_price_minor" TYPE NUMERIC(16, 6);

-- Riga documento: è qui che vive il caso più visibile, la cassa. Il prezzo
-- unitario netto è il valore da cui si ricostruisce il lordo digitato.
ALTER TABLE "document_lines"
  ALTER COLUMN "unit_price_minor" TYPE NUMERIC(16, 6);
