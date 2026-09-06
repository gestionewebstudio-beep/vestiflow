-- Ritiro della struttura «consegna / registrazione al commercialista».
--
-- Decisione del proprietario del progetto, 16/08/2026: VestiFlow non tiene
-- traccia di cosa è già stato mandato al commercialista, né per i documenti né
-- per i corrispettivi. L'operatore sceglie un periodo e produce stampa o file,
-- quante volte vuole; un export non deve lasciare uno stato «già consegnato».
--
-- Il codice applicativo che scriveva questi dati è già stato rimosso nello
-- stesso lavoro: qui resta da togliere la persistenza che nessuno alimenta più.
--
-- ── MISURATO PRIMA, sul database condiviso ────────────────────────────────
--   corrispettivi_deliveries ......................... 0 righe
--   sales_orders con fiscal_delivered_at valorizzato .. 0
--   sales_orders con fiscal_note valorizzato ......... 0
--   sales_orders nei due stati del flusso ............ 0  (37 su 37 pending)
--   documents goods_receipt externally_registered .... 2  (CAR-2026-0003, -0008)
--   loro movimenti / pezzi / varianti ................ 3 / 18 / 3
--   vincoli esterni verso corrispettivi_deliveries ... nessuno
--   migration fallite o incomplete ................... nessuna
--
-- Nessuno storico utente viene perso: le colonne e la tabella sono vuote.

-- ── 1. I due Arrivi merce lasciati da «Inviata al commercialista» ──────────
--
-- Senza quella funzione sarebbero rimasti `confirmed`, come gli altri 78; la
-- `registration_date` gliel'ha scritta `registerExternal()` come effetto
-- collaterale, e su un arrivo merce non è normalmente valorizzata (0 su 78).
--
-- Strettamente selettiva: solo tipo `goods_receipt` E stato
-- `externally_registered`. Idempotente: rieseguita non trova più righe.
-- NON tocca righe, quantità, movimenti, giacenze, numero, serie,
-- document_date, confirmed_at, tenant, sede o collegamenti.
UPDATE "documents"
   SET "status" = 'confirmed',
       "registration_date" = NULL
 WHERE "type" = 'goods_receipt'
   AND "status" = 'externally_registered';

-- ── 2. Lo storico delle consegne ai corrispettivi ─────────────────────────
-- Tabella dedicata esclusivamente al flusso ritirato, senza vincoli entranti.
DROP TABLE IF EXISTS "corrispettivi_deliveries";

-- ── 3. Le due colonne del flusso sull'ordine di vendita ───────────────────
-- `fiscal_delivered_at` la scriveva solo `markDelivered()`; `fiscal_note` solo
-- `updateFiscalStatus()`. Entrambi rimossi, entrambe le colonne vuote.
ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "fiscal_delivered_at";
ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "fiscal_note";

-- ── 4. Ciò che NON si tocca, e perché ─────────────────────────────────────
--
-- I valori morti restano nei due tipi enum PostgreSQL:
--   · DocumentStatus.externally_registered
--   · SalesOrderFiscalStatus.delivered_to_accountant / externally_registered
--
-- `ALTER TYPE ... DROP VALUE` non esiste in PostgreSQL: toglierli significa
-- ricostruire il tipo — togliere il default della colonna, crearne uno nuovo,
-- convertire, rinominare. Su un database CONDIVISO, dove convivono le tabelle
-- di un altro ramo che questo schema non conosce, il rischio non è
-- proporzionato al guadagno: sono valori che nessuna riga porta e che nessun
-- codice può più scrivere.
--
-- Resta invece intatta `sales_orders.fiscal_status` con i tre valori vivi
-- (`pending_registration`, `excluded_pos_register`, `invoiced`): sono
-- classificazioni fiscali, non passaggi di consegna.
