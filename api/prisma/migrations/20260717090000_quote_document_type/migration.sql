-- Preventivi (modulo dedicato, maschera identica all'Ordine cliente):
-- nuovo tipo documento `quote` con numeratore proprio (prefisso PRE nei
-- Numeratori) e campi testata «Pagamento» / «Consegna prevista» sul documento
-- (stessi dati dell'Ordine cliente manuale). Il preventivo non movimenta mai
-- il magazzino: nessun impegno, nessuno scarico.

ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'quote';

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "payment_terms" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "expected_delivery_date" DATE;
