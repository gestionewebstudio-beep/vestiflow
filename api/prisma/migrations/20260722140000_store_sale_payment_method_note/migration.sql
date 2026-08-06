-- Descrizione libera del metodo di pagamento «Altro» della Vendita in negozio.
-- paymentMethod resta il codice (cash/card/other) — così il filtro dell'elenco
-- continua a raggruppare correttamente — e il testo libero digitato in cassa
-- (es. «Assegno», «Bonifico») vive in questa colonna dedicata.
--
-- La tabella documents ha già la RLS abilitata (0003_enable_rls): una nuova
-- colonna eredita la protezione, nessun REVOKE aggiuntivo necessario.

ALTER TABLE "documents" ADD COLUMN "payment_method_note" TEXT;
