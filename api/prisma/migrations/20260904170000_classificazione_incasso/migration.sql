-- I Tipi pagamento dichiarano COME si incassano al banco (tranche C2B,
-- `docs/25` §7).
--
-- ── PERCHE' ────────────────────────────────────────────────────────────────
-- La Cassa deve sapere quali Tipi pagamento sono incassabili di persona e come
-- si comporta la maschera: i contanti chiedono il consegnato e calcolano il
-- resto, l'elettronico no.
--
-- ⛔ Non lo dice il catalogo normativo: MP01 «Contanti» e MP04 «Contanti presso
--    Tesoreria» sono entrambi contanti per la fatturazione elettronica, ma solo
--    il primo si incassa a un banco di negozio. E non lo dice il nome, che
--    l'utente puo' rinominare.
--
-- ⛔ Questa NON e' la classificazione fiscale del documento commerciale. La
--    rappresentazione AdE (blocchi 4.1 e 4.2, il non riscosso per aliquota, il
--    conteggio dei ticket) e la traduzione nel protocollo di un dispositivo
--    reale stanno in C5.
--
-- ── ADDITIVA E COMPATIBILE ─────────────────────────────────────────────────
--   · colonna NULLABLE, nessun default: il codice precedente non la scrive e
--     continua a funzionare;
--   · nessuna colonna rinominata o rimossa, nessun dato riscritto salvo il
--     backfill dichiarato qui sotto;
--   · l'enum nuovo non tocca `PaymentOptionKind`.

-- ── 1. L'enum operativo ────────────────────────────────────────────────────
--
-- ⚠️ `voucher` entra ORA pur non essendo selezionabile nella prima versione del
--    checkout: aggiungere un valore a un enum PostgreSQL in seguito e' una
--    migration a se', e questo evita di doverla fare per una decisione gia'
--    presa.
CREATE TYPE "PaymentTenderKind" AS ENUM ('cash', 'electronic', 'voucher');

ALTER TABLE "payment_options" ADD COLUMN "tender_kind" "PaymentTenderKind";

-- ── 2. Una condizione di pagamento non si incassa ──────────────────────────
--
-- ⛔ Stessa disciplina del CHECK sulla modalita' normativa (C2A): «30 gg f.m.»
--    non e' un modo di pagare al banco, e senza vincolo nulla impedirebbe di
--    classificarlo. Il controllo sta nel DATABASE perche' una guardia che vive
--    in un solo percorso applicativo si aggira dal percorso dopo.
ALTER TABLE "payment_options"
  ADD CONSTRAINT "payment_options_tender_kind_requires_method"
  CHECK ("kind" = 'method' OR "tender_kind" IS NULL);

-- ── 3. Il backfill: una mappa DICHIARATA di due voci ───────────────────────
--
-- ⛔ Non si deduce dal nome visualizzato: l'utente lo rinomina, e la regola
--    «rinominare un Tipo non cambia la classificazione» sarebbe violata per
--    costruzione.
--
-- ⛔ Non si deriva automaticamente dal catalogo normativo: «tutte le MP0x sono
--    contanti» e' falso, e sarebbe una regola inventata.
--
-- ⭐ La chiave e' il CODICE, che non cambia mai, e la condizione include
--    `is_system = true`: le voci personalizzate del tenant non si classificano
--    da sole — chi le ha create sa cosa sono, e la Cassa non deve indovinarlo.
--
-- ⚠️ Restano NULL, e ognuna e' una scelta: bonifico e domiciliazioni (non si
--    incassano di persona), l'assegno (non e' contante ne' elettronico: il
--    titolare puo' classificarlo dalle Impostazioni), MP04 «Contanti presso
--    Tesoreria» (non e' la cassa del negozio), e tutte le condizioni.

-- MP01 «Contanti» → cash
UPDATE "payment_options" AS po
   SET "tender_kind" = 'cash'
  FROM "payment_method_codes" AS pmc
 WHERE po."method_code_id" = pmc."id"
   AND pmc."code" = 'MP01'
   AND po."is_system" = true
   AND po."kind" = 'method';

-- MP08 «Carta di pagamento» → electronic
UPDATE "payment_options" AS po
   SET "tender_kind" = 'electronic'
  FROM "payment_method_codes" AS pmc
 WHERE po."method_code_id" = pmc."id"
   AND pmc."code" = 'MP08'
   AND po."is_system" = true
   AND po."kind" = 'method';
