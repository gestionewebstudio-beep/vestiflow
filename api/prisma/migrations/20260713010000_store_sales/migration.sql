-- FASE 3 — Vendita in negozio (cassa interna non fiscale) e Reso vendita negozio.
-- Nuovi tipi documento store_sale / store_return: documenti reali con righe,
-- creati SOLO dal flusso dedicato (mai da POST /documents). La vendita scarica
-- la Giacenza con movimenti `sale` (origine vestiflow_pos) collegati per riga;
-- il reso ricarica solo la merce rientrata vendibile con movimenti `return`.

ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'store_sale';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'store_return';

-- Modalità di pagamento della Vendita in negozio (cash/card/other).
ALTER TABLE "documents" ADD COLUMN "payment_method" TEXT;
