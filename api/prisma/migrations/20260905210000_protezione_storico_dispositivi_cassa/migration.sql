-- Correzione della migration 20260904180000, che creava lo storico senza RLS.
-- Non si riscrive una migration già distribuita: questa protegge anche gli
-- aggiornamenti con dati esistenti. Nessuna modifica alle righe o ai riferimenti.
-- Il backend usa il proprietario della tabella; niente FORCE ROW LEVEL SECURITY.
ALTER TABLE "cash_session_device_changes" ENABLE ROW LEVEL SECURITY;

-- Le revoche includono PUBLIC: un privilegio ereditato da PUBLIC non viene
-- rimosso revocando soltanto la concessione diretta ai due ruoli Data API.
REVOKE ALL ON "cash_session_device_changes" FROM PUBLIC, anon, authenticated;
