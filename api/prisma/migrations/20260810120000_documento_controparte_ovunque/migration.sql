-- Il documento della controparte (tipo + numero + data) su OGNI documento, e i
-- tipi documento che si possono eliminare senza portarsi via lo storico.
--
-- Due cose, e la seconda esiste solo perche' la prima l'ha resa possibile:
--
-- 1. Eliminare un tipo gia' usato diventa un soft-delete (`deleted_at`): la voce
--    sparisce dalla tendina e dal pannello, ma i documenti storici continuano a
--    puntarla e a mostrarne lo snapshot. Perche' regga, gli indici di univocita'
--    del nome devono ignorare le righe cancellate: altrimenti un tipo eliminato
--    si tiene il proprio nome per sempre e ricrearlo darebbe un errore che
--    l'operatore non sa spiegarsi ("Bolla doganale esiste gia'" — dove?).
--    Prisma non sa esprimere un indice parziale, quindi `@@unique` sparisce
--    dallo schema e l'indice vive qui: stesso trattamento gia' riservato al
--    numero documento.
--
-- 2. Ordine cliente e Ordine fornitore non sono `Document`: le tre colonne del
--    riferimento controparte gli mancano del tutto e vanno aggiunte. Sui
--    `Document` c'erano gia' dal 20260712110000 (servivano all'Arrivo merce):
--    li' non si tocca niente, si comincia solo a usarle su tutti i tipi.

-- ── 1. Univocita' del nome solo fra i tipi vivi ──────────────────────────────
DROP INDEX IF EXISTS "external_document_types_tenant_id_name_key";
DROP INDEX IF EXISTS "external_document_types_tenant_lower_name_key";

CREATE UNIQUE INDEX "external_document_types_tenant_id_name_key"
  ON "external_document_types" ("tenant_id", "name")
  WHERE "deleted_at" IS NULL;

-- Univocita' case-insensitive: "Bolla doganale" e "bolla doganale" sono la
-- stessa voce in una tendina (regola gia' introdotta dalla migration di luglio).
CREATE UNIQUE INDEX "external_document_types_tenant_lower_name_key"
  ON "external_document_types" ("tenant_id", lower("name"))
  WHERE "deleted_at" IS NULL;

-- ── 2. Riferimento controparte sull'Ordine cliente ───────────────────────────
-- `external_ref` resta dov'e': e' un testo libero storico, queste sono le tre
-- voci strutturate (tipo, numero, data) che l'operatore compila in testata.
ALTER TABLE "sales_orders"
  ADD COLUMN "external_doc_number" TEXT,
  ADD COLUMN "external_doc_date" DATE,
  ADD COLUMN "external_document_type_id" UUID,
  ADD COLUMN "external_document_type_snapshot" TEXT;

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_external_document_type_id_fkey"
  FOREIGN KEY ("external_document_type_id") REFERENCES "external_document_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. Riferimento controparte sull'Ordine fornitore ─────────────────────────
-- Come sopra: `supplier_reference` e' il riferimento libero comunicato dal
-- fornitore, queste sono le tre voci strutturate.
ALTER TABLE "supplier_orders"
  ADD COLUMN "external_doc_number" TEXT,
  ADD COLUMN "external_doc_date" DATE,
  ADD COLUMN "external_document_type_id" UUID,
  ADD COLUMN "external_document_type_snapshot" TEXT;

ALTER TABLE "supplier_orders"
  ADD CONSTRAINT "supplier_orders_external_document_type_id_fkey"
  FOREIGN KEY ("external_document_type_id") REFERENCES "external_document_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 4. Indici di ricerca sul numero del documento controparte ────────────────
-- La ricerca libera degli elenchi guarda anche questo campo: senza indice
-- diventa una scansione per ogni tasto premuto.
CREATE INDEX "sales_orders_tenant_id_external_doc_number_idx"
  ON "sales_orders" ("tenant_id", "external_doc_number");

CREATE INDEX "supplier_orders_tenant_id_external_doc_number_idx"
  ON "supplier_orders" ("tenant_id", "external_doc_number");
