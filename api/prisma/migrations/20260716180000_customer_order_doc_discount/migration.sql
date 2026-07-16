-- Ordine cliente manuale: sconto extra percentuale a livello documento,
-- applicato DOPO gli sconti riga sull'imponibile complessivo (stesso
-- pattern di documents.document_discount_percent dell'Arrivo merce).
ALTER TABLE "sales_orders"
  ADD COLUMN "document_discount_percent" INTEGER NOT NULL DEFAULT 0;
