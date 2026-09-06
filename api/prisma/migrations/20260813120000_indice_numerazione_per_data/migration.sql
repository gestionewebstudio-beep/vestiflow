-- Indici di appoggio per la proposta del numero PER DATA (specifica
-- numerazione §2).
--
-- La regola nuova non è più «il massimo della serie + 1». È:
--
--   sia m il numero più alto fra i documenti dello stesso contatore con data
--   STRETTAMENTE ANTERIORE a quella del documento che sto creando; si propone
--   il primo numero libero maggiore di m.
--
-- Serve perché un documento datato avanti non deve bruciare i numeri di oggi:
-- con `max+1`, un preventivo datato la settimana prossima e numerato 15 fa
-- partire da 16 tutta la numerazione corrente.
--
-- **Perché l'indice viene PRIMA della query.** Il calcolo gira DENTRO l'advisory
-- lock, cioè nel tratto in cui gli operatori si aspettano a vicenda. Senza un
-- indice che porti `document_date` accanto a (tenant, tipo, serie), il massimo
-- fra i documenti anteriori sarebbe una scansione dell'intera partizione — e
-- crescerebbe con l'archivio, dentro il lock. Misurata senza indice, la regola
-- sembrerebbe lenta per colpa della logica invece che dell'accesso ai dati.
--
-- L'indice non impone nulla e non cambia alcun comportamento: è additivo, e le
-- letture che oggi usano `..._type_series_number_idx` continuano a usarlo.
--
-- Tre tabelle perché le fonti del numero sono tre (`DocumentNumberSource`), con
-- partizioni e colonne data diverse:
--
--   documents        (tenant, type, series)            → document_date
--   supplier_orders  (tenant, series)                   → order_date
--   sales_orders     (tenant, source='manual', series)  → placed_at
--
-- Su `sales_orders` la data della testata finisce in `placed_at` (la maschera
-- scrive `placedAt: documentDate`), che per gli ordini manuali è sempre la
-- mezzanotte del giorno scelto: il confronto «strettamente anteriore» sul
-- timestamp coincide quindi col confronto per giorno.

-- Solo le righe numerate: le altre non entrano mai nel calcolo del massimo.
CREATE INDEX IF NOT EXISTS "documents_numbering_date_idx"
  ON "documents" ("tenant_id", "type", "series", "document_date", "number")
  WHERE "number" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "supplier_orders_numbering_date_idx"
  ON "supplier_orders" ("tenant_id", "series", "order_date", "number")
  WHERE "number" IS NOT NULL;

-- `source` nella chiave perché la lettura filtra gli ordini manuali: quelli di
-- canale portano il numero del canale e restano con `number` NULL.
CREATE INDEX IF NOT EXISTS "sales_orders_numbering_date_idx"
  ON "sales_orders" ("tenant_id", "source", "series", "placed_at", "number")
  WHERE "number" IS NOT NULL;
