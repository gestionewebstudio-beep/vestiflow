-- Posizione della riga nell'ordine fornitore (1-based), come `document_lines`
-- ce l'ha da sempre per gli altri sei tipi documento.
--
-- PERCHE' SERVE, e sono due cose.
--
-- 1. Un difetto che c'era gia' ed era muto: le righe di un ordine fornitore si
--    rileggevano SENZA `orderBy`, quindi il loro ordine era quello che
--    PostgreSQL restituiva. Di norma coincide con l'inserimento, ma non e'
--    garantito da niente: basta un aggiornamento perche' una riga cambi posto,
--    e chi rilegge il documento trova le righe mescolate senza spiegazione.
-- 2. L'ordinamento righe per contenuto (specifica §7.1): riordinare vuol dire
--    scrivere un ordine nuovo, e un ordine si scrive solo se c'e' dove metterlo.
--
-- SCRITTA A MANO, e non e' pigrizia. `prisma migrate diff` contro il datasource
-- qui NON si puo' usare: lo schema di questo ramo non conosce le tabelle della
-- cassa e dei documenti fiscali (cash_sessions, fiscal_receipts, pos_terminals,
-- store_sale_payments...), che nel database condiviso esistono perche' le ha
-- applicate il ramo del collega. Il diff le considera «di troppo» e genera piu'
-- di quaranta istruzioni per CANCELLARLE. Vedi la nota in regole-qualita.md.
--
-- Additiva e reversibile nei fatti: aggiunge una colonna con un valore di
-- riempimento e non tocca nient'altro.

ALTER TABLE "supplier_order_lines" ADD COLUMN "line_number" INTEGER NOT NULL DEFAULT 0;

-- Riempimento delle righe gia' esistenti. L'ordine che avevano finora e' quello
-- che il database restituiva, e l'unica cosa stabile a cui agganciarlo e' l'id:
-- non e' l'ordine di inserimento (che non e' registrato da nessuna parte), ma e'
-- un ordine STABILE, che e' esattamente cio' che oggi manca.
UPDATE "supplier_order_lines" AS l
SET "line_number" = numerata.posizione
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "order_id" ORDER BY "id") AS posizione
  FROM "supplier_order_lines"
) AS numerata
WHERE l."id" = numerata."id";

-- L'indice serve alla lettura ordinata delle righe di un ordine.
CREATE INDEX "supplier_order_lines_order_id_line_number_idx"
  ON "supplier_order_lines" ("order_id", "line_number");
