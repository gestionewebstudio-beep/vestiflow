-- Tranche 1.3 del modulo cassa: il registro Corrispettivi si apre alle
-- vendite/resi di negozio. La voce ora ha UNA e UNA SOLA origine: vendita
-- online (canali Shopify) oppure documento di cassa (canale `store`).
--
-- Il backfill delle vendite esistenti sta nella migration successiva: il
-- valore enum nuovo non è utilizzabile nella stessa transazione che lo crea.

ALTER TYPE "SalesOrderSource" ADD VALUE IF NOT EXISTS 'store';

-- Origine online facoltativa (le voci di cassa non ce l'hanno).
ALTER TABLE "corrispettivo_entries" ALTER COLUMN "online_sale_id" DROP NOT NULL;
ALTER TABLE "corrispettivo_entries" ALTER COLUMN "sales_order_id" DROP NOT NULL;

-- Origine cassa: il documento vendita/reso negozio (al più una voce per doc).
ALTER TABLE "corrispettivo_entries" ADD COLUMN "document_id" UUID;

CREATE UNIQUE INDEX "corrispettivo_entries_document_id_key" ON "corrispettivo_entries"("document_id");

-- La voce è storico contabile: il documento origine non si elimina (RESTRICT),
-- come già per la vendita online.
ALTER TABLE "corrispettivo_entries" ADD CONSTRAINT "corrispettivo_entries_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
