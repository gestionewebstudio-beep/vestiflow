-- Una riga di reso sa QUALE riga di vendita rettifica, e la ricevuta fiscale
-- conserva il numero di chiusura (tranche C4R, `docs/25` §12).
--
-- ── PERCHE' UN NOME NUOVO, E NON `source_document_line_id` ─────────────────
--
-- ⛔ Quel nome E' GIA' PRESO, da un concetto diverso e deliberatamente NON
--    persistito: `CreateDocumentLineDto.sourceDocumentLineId` e' il riferimento
--    TRANSIENTE che serve a comporre una riga duplicata o convertita —
--    `create-document.dto.ts:67`, prodotto a `documents.service.ts:2841`,
--    consumato a `:3868` e `:4015`, con un `FormControl` omonimo lato client
--    (`document-line-source-link.util.ts:22`) che il form manda a ogni
--    salvataggio.
--
-- ⛔ `regole-gestionale` lo dice in una riga: «Il riferimento non si persiste».
--    Una colonna con quel nome comincerebbe a riempirsi di legami di
--    DERIVAZIONE dal primo salvataggio, dentro un campo che si vuole leggere
--    come «quale vendita questa riga rende». Due significati nella stessa
--    colonna, e nessuno se ne accorge.
--
-- ⭐ `returned_from_line_id` ha un solo significato:
--
--      questa riga `store_return` restituisce quantita' e valore
--      della PRECISA riga di vendita indicata.

-- ══ 1. Il collegamento riga → riga ═════════════════════════════════════════
--
-- ⚠️ Nasce NULL su tutte le 208 righe esistenti, e non si fa backfill: i 15
--    resi storici non hanno un'origine ricostruibile, e dedurla per variante o
--    per prezzo sarebbe inventarla (`docs/25` §12).
ALTER TABLE "document_lines" ADD COLUMN "returned_from_line_id" UUID;

-- ⛔ `RESTRICT`, mai `SET NULL`: azzerare il riferimento perderebbe l'origine
--    IN SILENZIO — e questo collegamento e' permanente quanto quello fra
--    ricevute fiscali. E' la stessa correzione gia' fatta da C1C su
--    `fiscal_receipts.device_id` e da C2C sullo storico dei dispositivi.
--
-- ⚠️ MISURATO su tabelle temporanee, in transazione annullata: con questa FK
--    il `CASCADE` da `documents` NON puo' piu' attraversare le righe —
--    cancellare la vendita mentre un reso la referenzia da' 23503. E' voluto:
--    e' la protezione, non un effetto collaterale. Il rifiuto va reso leggibile
--    nel codice (guardia funzionale + traduzione mirata del P2003), perche' il
--    filtro globale sanifica in 500.
ALTER TABLE "document_lines"
  ADD CONSTRAINT "document_lines_returned_from_line_id_fkey"
  FOREIGN KEY ("returned_from_line_id") REFERENCES "document_lines"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "document_lines_returned_from_line_id_idx"
  ON "document_lines"("returned_from_line_id");

-- ⭐ La stessa riga originale non compare DUE VOLTE nello stesso documento di
--    reso: sarebbero due righe che rendono la stessa cosa, e il cumulativo
--    diventerebbe ambiguo.
--
-- ⛔ E NON un unique globale su `returned_from_line_id`: piu' resi PARZIALI in
--    documenti distinti devono restare possibili. Il limite cumulativo non lo
--    fa un vincolo — lo fanno lock e transazione (`docs/25` §12).
--
-- ⚠️ In PostgreSQL un UNIQUE con una colonna NULL non vincola nulla su quelle
--    righe: le 208 esistenti, e ogni riga non di reso, restano libere.
CREATE UNIQUE INDEX "document_lines_document_id_returned_from_line_id_key"
  ON "document_lines"("document_id", "returned_from_line_id");

-- ══ 2. Il numero di chiusura, e i tre campi che NON lo contengono ══════════
--
-- ⭐ Verificato campo per campo prima di aggiungerlo:
--
--      serial_number   MATRICOLA del dispositivo emittente, congelata sulla
--                      ricevuta — gemella di `fiscal_devices.serial_number`,
--                      «Matricola fiscale: finisce sul documento commerciale»
--      fiscal_number   progressivo del DOCUMENTO COMMERCIALE, e nient'altro
--      issued_at       istante dell'emissione
--      device_id       chiave esterna, non un dato fiscale
--
-- ⛔ Nessuno dei quattro contiene il numero di chiusura/azzeramento (Z).
--
-- ⚠️ TESTO e non intero: un numero di chiusura puo' avere zeri iniziali, e
--    perderli significa non poterlo piu' confrontare con lo scontrino di carta.
ALTER TABLE "fiscal_receipts" ADD COLUMN "closure_number" TEXT;

-- ⛔ E DA QUI `fiscal_number` CONTIENE IL SOLO PROGRESSIVO SCONTRINO.
--
--    L'unica implementazione mai scritta — nel ramo storico, dichiarato non
--    normativo — infilava il numero di chiusura DENTRO `fiscal_number` come
--    prefisso composto (`0012-0034`), con degrado silenzioso al solo numero
--    quando la chiusura mancava. Quella forma non si conserva: nel dominio i
--    due dati restano separati, e sara' l'adapter a comporli se il protocollo
--    di un dispositivo lo richiedera'.

-- ══ 3. Una ricevuta richiamata da un reso non si cancella ═════════════════
--
-- ⭐ Stesso principio del punto 1, e il precedente motivato e' accanto:
--    `FiscalReceipt.device` e' gia' `Restrict` da C1C.
--
-- ⚠️ Sicura perche' `fiscal_receipts` ha ZERO righe: nessun legame esistente
--    viene invalidato.
ALTER TABLE "fiscal_receipts"
  DROP CONSTRAINT "fiscal_receipts_original_receipt_id_fkey";

ALTER TABLE "fiscal_receipts"
  ADD CONSTRAINT "fiscal_receipts_original_receipt_id_fkey"
  FOREIGN KEY ("original_receipt_id") REFERENCES "fiscal_receipts"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ⛔ CIO' CHE QUESTA MIGRATION NON FA, ed e' deliberato:
--
--    · nessun backfill dei 15 resi storici: restano `source_document_id` e
--      `returned_from_line_id` a NULL, e nel registro si leggono come
--      «Reso storico — origine non disponibile»;
--    · `Document.sourceDocumentId` NON passa globalmente a RESTRICT: quella
--      relazione la condividono quattro conversioni documentali, e la
--      protezione del reso la da' gia' la self-FK delle righe;
--    · i cinque punti che cancellano righe al salvataggio ordinario (Arrivo
--      merce, Trasferimento, Rettifica) NON si riscrivono: non creeranno mai
--      collegamenti `returned_from_line_id`.
