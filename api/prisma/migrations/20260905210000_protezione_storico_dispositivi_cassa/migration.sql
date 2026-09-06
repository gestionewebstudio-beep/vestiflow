-- ⭐ RIAPPLICAZIONE DIFENSIVA, non piu` la correzione primaria.
--
-- ⚠️ Qui c'era: «Correzione della migration 20260904180000, che creava lo
--    storico senza RLS. Non si riscrive una migration gia` distribuita».
--    Quella premessa e' caduta il 06/09/2026: le undici migration di questo
--    lotto NON erano mai state applicate al database condiviso, quindi la
--    20260904180000 non era distribuita affatto. La protezione e` stata
--    spostata dove la regola la vuole — nella migration che CREA la tabella.
--
-- ⛔ Questa migration NON si toglie, per due ragioni.
--    1. E' gia` applicata su database usa-e-getta e di sviluppo che hanno
--       visto la forma vecchia della 20260904180000: la` e` l`unica cosa che
--       protegge la tabella.
--    2. Toglierla dallo storico farebbe risultare MANCANTE a Prisma una
--       migration registrata in `_prisma_migrations`, cioe` un problema vero
--       al posto di uno estetico.
--
-- ⭐ E` IDEMPOTENTE per costruzione, ed e` cio` che la rende sicura da
--    riapplicare dopo la correzione: abilitare una RLS gia` abilitata non
--    fa nulla e non solleva errore, e revocare privilegi che non ci sono
--    nemmeno. Su un database dove la 20260904180000 ha gia` protetto la
--    tabella, questa migration e` un no-op verificabile.
--
-- Nessuna modifica alle righe o ai riferimenti. Il backend usa il
-- proprietario della tabella; niente FORCE ROW LEVEL SECURITY.
ALTER TABLE "cash_session_device_changes" ENABLE ROW LEVEL SECURITY;

-- Le revoche includono PUBLIC: un privilegio ereditato da PUBLIC non viene
-- rimosso revocando soltanto la concessione diretta ai due ruoli Data API.
REVOKE ALL ON "cash_session_device_changes" FROM PUBLIC, anon, authenticated;
