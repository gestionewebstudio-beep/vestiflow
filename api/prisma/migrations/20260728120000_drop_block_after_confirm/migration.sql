-- Blocco modifica unificato: un documento confermato si riapre sempre bloccato
-- con possibilità di sblocco, per tutti i tipi, senza configurazione. Il flag
-- configurabile per tipo «Blocca modifica dopo conferma» non esiste più.
ALTER TABLE "document_type_settings" DROP COLUMN IF EXISTS "block_after_confirm";
