-- In VestiFlow esiste UN solo arrivo merce. Il documento che accompagnava la
-- merce (DDT, Fattura, Reso) è un'informazione che l'operatore indica e che
-- serve a comporre la causale — vive in `external_document_types`, non nel tipo
-- del documento VestiFlow.
--
-- `supplier_ddt` e `supplier_invoice_accompanying` erano tipi modellati e mai
-- raggiungibili dall'interfaccia: la maschera arrivo merce crea sempre
-- `goods_receipt`. Verificato prima di rimuoverli: nessun documento, nessuna
-- impostazione per tipo, nessuna preferenza operatore, nessun movimento. Solo
-- 7 numeratori creati d'ufficio e mai usati.

-- 1. Via i numeratori: sono le uniche righe che usano i due valori.
DELETE FROM "document_counters"
WHERE "type" IN ('supplier_ddt', 'supplier_invoice_accompanying');

-- 2. Postgres non sa togliere un valore da un enum: si ricrea il tipo e si
--    ri-agganciano le sei colonne che lo usano. Nessuna ha un DEFAULT, quindi
--    non serve staccarlo e rimetterlo.
ALTER TYPE "DocumentType" RENAME TO "DocumentType_old";

CREATE TYPE "DocumentType" AS ENUM (
  'supplier_order',
  'goods_receipt',
  'supplier_invoice',
  'manual_load',
  'initial_load',
  'sales_ddt',
  'transfer',
  'manual_unload',
  'adjustment',
  'inventory',
  'proforma',
  'invoice_draft',
  'invoice_accompanying',
  'online_sale',
  'corrispettivo',
  'customer_order',
  'store_sale',
  'store_return',
  'quote'
);

ALTER TABLE "document_counters"
  ALTER COLUMN "type" TYPE "DocumentType" USING "type"::text::"DocumentType";
ALTER TABLE "document_sequences"
  ALTER COLUMN "type" TYPE "DocumentType" USING "type"::text::"DocumentType";
ALTER TABLE "document_type_settings"
  ALTER COLUMN "type" TYPE "DocumentType" USING "type"::text::"DocumentType";
ALTER TABLE "documents"
  ALTER COLUMN "type" TYPE "DocumentType" USING "type"::text::"DocumentType";
ALTER TABLE "stock_movements"
  ALTER COLUMN "source_document_type" TYPE "DocumentType" USING "source_document_type"::text::"DocumentType";
ALTER TABLE "user_document_price_mode_preferences"
  ALTER COLUMN "document_type" TYPE "DocumentType" USING "document_type"::text::"DocumentType";

DROP TYPE "DocumentType_old";
