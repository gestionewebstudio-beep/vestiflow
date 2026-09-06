-- Lo schema dormiente della Cassa parla il vocabolario di C2B, e i cambi di
-- dispositivo lasciano una traccia (tranche C2C, `docs/25` §9 e §10).
--
-- ── PERCHE' ────────────────────────────────────────────────────────────────
-- `cash_sessions` conservava conteggi e attesi per `cash | card | other`, che
-- e' il vocabolario del DOCUMENTO Vendita al banco. C2B ha approvato per la
-- Cassa `cash | electronic | voucher` piu' `NULL` = non utilizzabile.
--
-- ⛔ `card` NON e' sinonimo di `electronic`: quest'ultimo e' piu' largo — carta,
--    bancomat, Satispay, un bonifico istantaneo fatto al banco. E `other` NON
--    e' `voucher`: era la DISCARICA dei metodi sconosciuti, e in produzione non
--    e' mai stato usato (misurato: 0 righe).
--
-- ⭐ E il contante e l'elettronico non si trattano allo stesso modo:
--
--      il CONTANTE si CONTA          l'operatore apre il cassetto e conta
--      l'ELETTRONICO si RICONCILIA   si legge il totale sul POS e lo si dichiara
--
--    `counted_card_minor` presupponeva che la carta si contasse, che
--    fisicamente non accade: la colonna cambia nome E significato.
--
-- ── PERCHE' SI PUO' FARE ORA ───────────────────────────────────────────────
-- Riconfermato in sola lettura sul condiviso il 04/09/2026:
--
--   cash_sessions 0 righe · cash_session_movements 0 righe
--   le sei colonne toccate sono tutte NULLABLE
--   nessun servizio applicativo legge o scrive queste tabelle
--
-- ⚠️ Una rinomina NON e' additiva: e' sicura soltanto perche' la tabella e'
--    vuota e nessun codice la nomina. Se la Cassa fosse gia' in esercizio,
--    questa sarebbe una migrazione di dati.

-- ══ 1. Il vocabolario della chiusura ═══════════════════════════════════════

-- ⭐ L'atteso elettronico: un valore CALCOLATO dalle quote e congelato alla
--    chiusura. Cambia il nome, non il significato.
ALTER TABLE "cash_sessions"
  RENAME COLUMN "expected_card_minor" TO "expected_electronic_minor";

-- ⛔ Qui cambia anche il SIGNIFICATO, ed e' il punto della tranche: non e' un
--    conteggio ma una DICHIARAZIONE. Facoltativa: `NULL` significa «non
--    riconciliato», che e' uno stato legittimo di chiusura.
ALTER TABLE "cash_sessions"
  RENAME COLUMN "counted_card_minor" TO "declared_electronic_minor";

-- ⛔ `other` non e' una classe di C2B, e non lo diventa: era il ripiego per i
--    metodi sconosciuti. Le due colonne spariscono invece di essere rinominate
--    in `voucher`, che sarebbe la traduzione sbagliata di una discarica.
--
-- ⚠️ Nessuna colonna voucher si aggiunge ORA: i buoni sono modellati in C2B ma
--    non abilitati, e una colonna che nessuno scrive e' solo un invito a
--    riempirla per sbaglio. Arrivera' con la loro abilitazione.
ALTER TABLE "cash_sessions" DROP COLUMN "counted_other_minor";
ALTER TABLE "cash_sessions" DROP COLUMN "expected_other_minor";

-- ⚠️ `counted_cash_minor` e `expected_cash_minor` RESTANO come sono: il
--    contante e' l'unico conteggio fisico vero, e il suo nome lo dice gia'.
--
-- ⛔ La DIFFERENZA di cassa non diventa una colonna: e'
--    `counted_cash_minor - expected_cash_minor`, entrambi congelati alla
--    chiusura. Persisterla creerebbe un terzo valore capace di contraddire i
--    due da cui deriva.
--
-- ⚠️ Gli attesi si calcolano e si congelano in C4B, che e' quando esisteranno
--    le quote da cui derivano. Fino ad allora restano NULL.

-- ══ 2. Lo storico dei cambi dispositivo ════════════════════════════════════
--
-- ⭐ C1C ha reso `cash_sessions.fiscal_device_id` il dispositivo OPERATIVO
--    corrente. Riscriverlo perde il momento e la ragione del passaggio al
--    muletto, che e' proprio cio' che serve quando si riconcilia una chiusura
--    con due serie fiscali.
--
-- ⛔ NON e' un `CashSessionMovement`: un cambio dispositivo non e' un movimento
--    di denaro, e rappresentarlo la' richiederebbe di inventare un importo e di
--    aggiungere un terzo valore a `deposit | withdrawal`.
CREATE TABLE "cash_session_device_changes" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  -- ⚠️ Ridondante rispetto alla sessione, e tenuto lo stesso: e' la stessa
  --    scelta gia' fatta per `cash_session_movements.tenant_id`, e serve a
  --    interrogare lo storico senza passare da una join.
  "location_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  -- ⭐ NULL al PRIMO assegnamento: non e' un dato mancante, e' l'inizio.
  "previous_device_id" UUID,
  -- ⭐ NULL quando il dispositivo si TOGLIE: la sessione smette di fiscalizzare.
  "new_device_id" UUID,
  -- Obbligatoria, come su `cash_session_movements`: un passaggio al muletto
  -- senza motivo non e' ricostruibile a distanza di mesi.
  "reason" TEXT NOT NULL,
  "changed_by_id" UUID,
  -- Snapshot operatore: lo storico regge anche se l'utente cambia nome o
  -- viene disattivato.
  "changed_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cash_session_device_changes_pkey" PRIMARY KEY ("id")
);

-- ⛔ NESSUNA colonna `updated_at`, ed e' la garanzia strutturale
--    dell'append-only: la stessa scelta di `cash_session_movements`, che la
--    dichiara nel proprio commento. Una riga di storico non si corregge in
--    posto — se e' sbagliata, il rimedio e' una riga nuova che lo dice.

-- ── I due vincoli di senso ─────────────────────────────────────────────────
--
-- ⭐ `IS DISTINCT FROM` e non `<>`: con `<>` due NULL producono NULL, che per
--    un CHECK vale come «passa». Sarebbe il vincolo che non vincola.
ALTER TABLE "cash_session_device_changes"
  ADD CONSTRAINT "cash_session_device_changes_devices_differ"
  CHECK ("previous_device_id" IS DISTINCT FROM "new_device_id");

-- Una riga che non nomina alcun dispositivo non racconta nessun cambio.
--
-- ⚠️ E' RIDONDANTE rispetto al precedente, ed e' onesto scriverlo: misurato su
--    PostgreSQL il 04/09/2026 provando a falsificarlo —
--
--      NULL IS DISTINCT FROM NULL  →  false     il primo CHECK rifiuta gia'
--      NULL <> NULL                →  NULL      (per questo non si usa `<>`)
--
--    Togliere questo vincolo non fa passare nessuna riga in piu': la prova che
--    doveva arrossare resta verde. Resta comunque, per due ragioni — dichiara
--    l'intenzione a chi legge, e continuerebbe a proteggere se un giorno il
--    primo venisse allentato.
ALTER TABLE "cash_session_device_changes"
  ADD CONSTRAINT "cash_session_device_changes_one_device_present"
  CHECK ("previous_device_id" IS NOT NULL OR "new_device_id" IS NOT NULL);

-- ── Le chiavi esterne, e perche' questi `ON DELETE` ────────────────────────
--
-- ⛔ I due dispositivi sono `RESTRICT`, mai `SET NULL`: azzerare il riferimento
--    cancellerebbe proprio l'identita' che lo storico esiste per conservare, e
--    lo farebbe in silenzio. E' la stessa correzione fatta da C1C su
--    `fiscal_receipts.device_id`, che era `SET NULL`.
--
-- ⚠️ Ne discende che un dispositivo nominato in uno storico NON si cancella
--    piu'. E' voluto: un dispositivo si DISABILITA (`enabled = false`), che
--    non tocca lo storico — C1B lo ha reso la strada prevista.
ALTER TABLE "cash_session_device_changes"
  ADD CONSTRAINT "cash_session_device_changes_previous_device_id_fkey"
  FOREIGN KEY ("previous_device_id") REFERENCES "fiscal_devices"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "cash_session_device_changes"
  ADD CONSTRAINT "cash_session_device_changes_new_device_id_fkey"
  FOREIGN KEY ("new_device_id") REFERENCES "fiscal_devices"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ⚠️ La sessione e' `CASCADE`, come per `cash_session_movements`: se una
--    sessione non esiste piu', il suo storico non ha piu' un soggetto. Non e'
--    una perdita di storico — e' la sua fine insieme a cio' che descriveva.
ALTER TABLE "cash_session_device_changes"
  ADD CONSTRAINT "cash_session_device_changes_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "cash_sessions"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "cash_session_device_changes"
  ADD CONSTRAINT "cash_session_device_changes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "cash_session_device_changes"
  ADD CONSTRAINT "cash_session_device_changes_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ⛔ CIO' CHE IL DATABASE NON PUO' GARANTIRE, e resta al validatore
--    transazionale di C3 (`docs/25` §13, limite ereditato):
--
--      · che `session_id` appartenga a `tenant_id` e a `location_id`;
--      · che i due dispositivi appartengano allo stesso tenant e alla stessa
--        sede della sessione;
--      · che `previous_device_id` sia davvero il dispositivo corrente della
--        sessione al momento del cambio;
--      · che la sessione sia APERTA.
--
--    Le chiavi esterne legano gli identificativi UNO PER UNO, e senza un
--    `UNIQUE(tenant_id, id)` sulle tabelle bersaglio una FK composta non
--    sarebbe nemmeno dichiarabile. Sono quattro verifiche APPLICATIVE, e vanno
--    fatte DENTRO la transazione che scrive: fra un controllo fuori
--    transazione e la scrittura, la sessione puo' chiudersi.

CREATE INDEX "cash_session_device_changes_session_id_created_at_idx"
  ON "cash_session_device_changes"("session_id", "created_at");

CREATE INDEX "cash_session_device_changes_tenant_id_idx"
  ON "cash_session_device_changes"("tenant_id");
