-- Una quota di rimborso sa QUALE quota dell'incasso restituisce
-- (tranche C4R, correzione; `docs/25` §12).
--
-- ── IL BUCO, misurato nel codice di C4R ────────────────────────────────────
-- Il cumulativo del rimborso era calcolato per `payment_option_id`, e la
-- lettura saltava le quote senza Tipo:
--
--   cash-return.service.ts:447   if (!q.paymentOptionId || ...) continue;
--   cash-return.service.ts:470   if (!r.paymentOptionId) continue;
--
-- ⛔ Ne discendevano due difetti, e il secondo e' peggiore del primo:
--
--   1. Tipo pagamento ELIMINATO (C4A lo permette, con `SET NULL`) → la quota
--      originale spariva dalla mappa, e quel denaro non si poteva piu'
--      rimborsare senza RICREARE il Tipo.
--
--   2. E un rimborso gia' fatto su quella quota NON entrava nel cumulativo:
--      si poteva rimborsare DUE VOLTE lo stesso incasso.
--
-- ⛔ Piu' un terzo, che il collegamento per Tipo non poteva vedere: due resi
--    CONCORRENTI su righe prodotto DIVERSE non competono su nessuna riga, ma
--    attingono alla stessa quota. Il lock stava solo sulle righe.
--
-- ⭐ L'identita' di una quota non e' il suo Tipo: e' la quota. E il rimborso
--    restituisce QUELLA, non «un incasso di quel tipo».

-- ══ Il collegamento quota → quota ══════════════════════════════════════════
--
-- ⚠️ Nullable: le quote di VENDITA non rimborsano niente, e le quote legacy
--    non hanno un'origine ricostruibile — nessun backfill dedotto.
ALTER TABLE "store_sale_payments" ADD COLUMN "refunded_from_payment_id" UUID;

-- ⛔ `RESTRICT`, mai `SET NULL`: azzerare il riferimento perderebbe l'origine
--    del rimborso IN SILENZIO, e con lei il cumulativo — cioe' esattamente il
--    difetto che questa migration chiude. E' la stessa scelta della self-FK
--    delle righe (`20260904200000`).
--
-- ⚠️ Ne discende che una quota rimborsata non si cancella piu'. E' voluto: un
--    documento di vendita con un reso collegato non si elimina comunque, per
--    la self-FK delle righe.
ALTER TABLE "store_sale_payments"
  ADD CONSTRAINT "store_sale_payments_refunded_from_payment_id_fkey"
  FOREIGN KEY ("refunded_from_payment_id") REFERENCES "store_sale_payments"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "store_sale_payments_refunded_from_payment_id_idx"
  ON "store_sale_payments"("refunded_from_payment_id");

-- ⭐ La stessa quota originale non compare DUE VOLTE nello stesso documento di
--    reso: sarebbero due rimborsi dello stesso incasso nella stessa
--    operazione, e il cumulativo diventerebbe ambiguo da leggere.
--
-- ⛔ E NON un unique globale: piu' rimborsi PARZIALI della stessa quota, in
--    resi distinti, devono restare possibili. Il limite lo fanno lock e
--    transazione, non un vincolo.
--
-- ⚠️ In PostgreSQL un UNIQUE con colonna NULL non vincola quelle righe: le
--    quote di vendita, che sono la maggioranza, restano libere.
CREATE UNIQUE INDEX "store_sale_payments_document_id_refunded_from_payment_id_key"
  ON "store_sale_payments"("document_id", "refunded_from_payment_id");

-- ⛔ CIO' CHE QUESTA MIGRATION NON FA:
--
--    · nessun backfill: l'unica riga legacy non rimborsa niente, e i resi
--      storici non hanno quote collegabili;
--    · nessun vincolo che imponga il collegamento sulle quote di reso: il
--      database ammette una quota senza origine perche' deve ammettere le
--      quote di VENDITA, che origine non ne hanno. A pretenderlo sulle quote
--      di reso e' il servizio.
