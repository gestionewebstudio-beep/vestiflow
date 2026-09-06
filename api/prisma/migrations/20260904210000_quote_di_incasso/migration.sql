-- Le quote di incasso della Cassa: Tipo pagamento, snapshot, e il vecchio
-- `method` che diventa legacy (tranche C4A, `docs/25` §5-bis).
--
-- ── PERCHE' ────────────────────────────────────────────────────────────────
-- `store_sale_payments` nasceva col vocabolario della Vendita al banco:
-- `method` come stringa libera fra `cash | card | other`. La Cassa incassa con
-- i **Tipi pagamento** del tenant (C2A) classificati da `PaymentTenderKind`
-- (C2B), e scrivere in `method` significherebbe tornare al vocabolario che
-- quelle due tranche hanno sostituito.
--
-- ⭐ Le tre colonne nuove sono la FOTOGRAFIA dell'incasso: il Tipo puo' essere
--    rinominato o riclassificato domani, e una quota registra cio' che e'
--    successo oggi. E' la stessa disciplina delle righe documento
--    (`regole-gestionale`, «la riga di un documento e' una fotografia»).
--
-- ── ADDITIVA, E MISURATA SUI DATI VERI ─────────────────────────────────────
-- Letto in sola lettura sul condiviso il 04/09/2026:
--
--   store_sale_payments        1 riga:  method='cash', amount_minor=0
--   coppie (document_id, position) duplicate       0   → UNIQUE applicabile
--   amount_minor negativi                          0   → CHECK >= 0 applicabile
--
-- ⚠️ Quella riga a importo ZERO decide la forma del vincolo: un `CHECK > 0`
--    sarebbe stato RIFIUTATO dai dati esistenti — provato. Il database ammette
--    quindi `>= 0`, e a pretendere quote strettamente positive e' il SERVIZIO
--    della Cassa.

-- ══ 1. Il Tipo pagamento, e la sua fotografia ══════════════════════════════
--
-- ⚠️ `SET NULL` e non `RESTRICT`, ed e' l'opposto della scelta fatta per il
--    reso: qui il riferimento e' una comodita' di navigazione, non l'identita'
--    del dato. Il titolare deve poter eliminare un Tipo pagamento che non usa
--    piu', e la quota storica resta leggibile dai propri snapshot — che sono
--    la ragione per cui esistono.
ALTER TABLE "store_sale_payments" ADD COLUMN "payment_option_id" UUID;

ALTER TABLE "store_sale_payments"
  ADD CONSTRAINT "store_sale_payments_payment_option_id_fkey"
  FOREIGN KEY ("payment_option_id") REFERENCES "payment_options"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "store_sale_payments_payment_option_id_idx"
  ON "store_sale_payments"("payment_option_id");

-- Il NOME come si leggeva al momento dell'incasso.
ALTER TABLE "store_sale_payments" ADD COLUMN "option_name_snapshot" TEXT;

-- La CLASSE come si leggeva al momento dell'incasso.
--
-- ⭐ E' il dato da cui C4B calcolera' gli attesi di chiusura: senza,
--    riclassificare un Tipo a settembre cambierebbe la quadratura di una
--    sessione chiusa a marzo.
ALTER TABLE "store_sale_payments"
  ADD COLUMN "tender_kind_snapshot" "PaymentTenderKind";

-- ══ 2. `method` diventa LEGACY ═════════════════════════════════════════════
--
-- ⛔ Resta, e resta SOLO per la Vendita al banco: e' il vocabolario
--    `cash | card | other` che quel documento continua a usare. La Cassa non
--    lo scrive mai.
--
-- ⚠️ Diventa nullable perche' una quota della Cassa non ha nulla da metterci:
--    lasciarlo NOT NULL costringerebbe a inventare un valore di quel
--    vocabolario, che e' esattamente cio' che C2B ha smesso di fare.
ALTER TABLE "store_sale_payments" ALTER COLUMN "method" DROP NOT NULL;

-- ══ 3. I vincoli di forma ══════════════════════════════════════════════════
--
-- ⚠️ `>= 0` e non `> 0`: la riga legacy a importo zero esiste, e un vincolo
--    piu' stretto rifiuterebbe la migration. Le quote della Cassa sono
--    strettamente positive per regola del SERVIZIO — il verso lo dice il tipo
--    documento, non il segno.
ALTER TABLE "store_sale_payments"
  ADD CONSTRAINT "store_sale_payments_amount_minor_non_negative"
  CHECK ("amount_minor" >= 0);

-- Il denaro CONSEGNATO non puo' essere inferiore alla quota che paga: sarebbe
-- un resto negativo.
--
-- ⚠️ `NULL` resta ammesso: `tendered_minor` vale solo per il contante, e su una
--    quota elettronica non significa niente.
ALTER TABLE "store_sale_payments"
  ADD CONSTRAINT "store_sale_payments_tendered_not_below_amount"
  CHECK ("tendered_minor" IS NULL OR "tendered_minor" >= "amount_minor");

-- ⭐ Posizione STABILE: due quote non occupano lo stesso posto nello stesso
--    documento. Verificato prima di introdurlo: zero coppie duplicate sui dati
--    esistenti.
CREATE UNIQUE INDEX "store_sale_payments_document_id_position_key"
  ON "store_sale_payments"("document_id", "position");

-- ⛔ CIO' CHE QUESTA MIGRATION NON FA:
--
--    · nessun backfill di `payment_option_id` sull'unica riga esistente: quel
--      `method='cash'` non identifica un Tipo pagamento del tenant, e sceglierne
--      uno sarebbe inventarlo;
--    · nessuna colonna «misto»: il riepilogo si CALCOLA dalle quote e non si
--      persiste (`docs/25` §6, decisione vigente 4);
--    · nessun `ticket_count`: i buoni sono modellati in C2B ma non abilitati.
