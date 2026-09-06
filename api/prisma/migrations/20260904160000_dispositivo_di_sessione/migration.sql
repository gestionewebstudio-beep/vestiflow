-- Il dispositivo fiscale si lega alla SESSIONE, e chi ha emesso non si perde
-- (tranche C1C, `docs/25` §10).
--
-- ── PERCHE' ────────────────────────────────────────────────────────────────
-- C1B ha tolto l'unicita' per sede: una sede puo' avere piu' dispositivi. Ma
-- toglierla e basta lascia aperta la domanda «quale si usa», e la vecchia
-- risposta (`findFirst({ locationId, enabled: true })`) da deterministica
-- diventa «uno a caso».
--
-- Deciso dal proprietario il 04/09/2026: **principale + riserva**, non due
-- postazioni operative. La forma e' quindi la piu' semplice che risolva la
-- selezione — il dispositivo appartiene alla SESSIONE — e resta valida anche
-- il giorno in cui esistesse una postazione vera (`docs/25` §10).
--
-- ⚠️ Misurato in sola lettura sul condiviso il 04/09/2026:
--    cash_sessions 0 righe · fiscal_devices 0 righe · fiscal_receipts 0 righe
--    Nessun dato da convertire, nessun consumer applicativo esistente.

-- ── 1. La sessione DICHIARA il proprio dispositivo ─────────────────────────
--
-- ⭐ Nullable di proposito, e sono DUE casi diversi che convivono:
--    · una sede senza registratore telematico apre sessioni e non fiscalizza;
--    · il dispositivo si sceglie all'apertura, ma un passaggio al muletto
--      durante la sessione lo sostituisce (azione esplicita e tracciata).
--
-- ⛔ `NULL` non significa «prendi il predefinito»: significa «questa sessione
--    non ha un dispositivo», e allora non si emette. La selezione implicita e'
--    esattamente cio' che questa tranche elimina.
ALTER TABLE "cash_sessions" ADD COLUMN "fiscal_device_id" UUID;

-- ⛔ RESTRICT e non SET NULL: una sessione che ha incassato non puo' perdere
--    l'informazione di CON QUALE dispositivo lo ha fatto. Un dispositivo si
--    disabilita (`enabled = false`), non si cancella: la disabilitazione e' la
--    strada prevista e non tocca lo storico.
ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_fiscal_device_id_fkey"
  FOREIGN KEY ("fiscal_device_id") REFERENCES "fiscal_devices"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "cash_sessions_fiscal_device_id_idx"
  ON "cash_sessions"("fiscal_device_id");

-- ── 2. Chi ha EMESSO non si perde ──────────────────────────────────────────
--
-- ⛔ `fiscal_receipts.device_id` era `ON DELETE SET NULL`: cancellare un
--    dispositivo azzerava il riferimento su TUTTE le ricevute che aveva
--    emesso, in silenzio e senza lasciare traccia di quale fosse.
--
-- ⚠️ Non e' un dettaglio di integrita': ogni RT ha memoria fiscale, numerazione
--    e chiusura giornaliera PROPRIE. Con due dispositivi nella stessa sede —
--    principale e riserva — due serie fiscali convivono, e una ricevuta senza
--    dispositivo non e' piu' riconciliabile con la chiusura che la contiene.
--
-- ⭐ `device_id` resta NULLABLE: un tentativo mai partito puo' non avere un
--    dispositivo. Cio' che non puo' accadere e' PERDERLO dopo averlo avuto.
ALTER TABLE "fiscal_receipts" DROP CONSTRAINT "fiscal_receipts_device_id_fkey";

ALTER TABLE "fiscal_receipts"
  ADD CONSTRAINT "fiscal_receipts_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "fiscal_devices"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;
