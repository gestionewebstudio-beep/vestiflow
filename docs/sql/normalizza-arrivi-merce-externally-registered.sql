-- Normalizzazione dei due Arrivi merce lasciati da «Inviata al commercialista».
-- Scritta il 16/08/2026. NON ANCORA ESEGUITA: attende il via esplicito.
--
-- Contesto. L'azione «Inviata al commercialista» è stata rimossa dal codice:
-- nessuna maschera e nessun endpoint può più scrivere `externally_registered`.
-- Restano due Arrivi merce che ce l'hanno, e che senza quella funzione sarebbero
-- rimasti `confirmed` come gli altri 78. La `registration_date` che portano è
-- stata scritta da `registerExternal()` come effetto collaterale: su un arrivo
-- merce non è normalmente valorizzata (0 su 78).
--
-- Perché è sicura:
--   · tocca SOLO due colonne di `documents`, e SOLO sui documenti che hanno
--     insieme tipo `goods_receipt` e stato `externally_registered`;
--   · non tocca righe, quantità, movimenti, giacenze, numero, serie,
--     `document_date` né `confirmed_at`;
--   · nessuna logica di magazzino guarda lo stato del documento: i 3 movimenti
--     `load` (18 pezzi su 3 varianti) restano identici;
--   · è IDEMPOTENTE: rieseguirla non trova più righe e aggiorna 0 record.
--
-- Effetti attesi, misurati prima:
--   · i due documenti tornano modificabili previo sblocco, come ogni arrivo merce;
--   · il badge passa da «Registrato esternamente» a «Confermato»;
--   · nessun altro contatore cambia (quelli del Registro commercialista sono
--     stati rimossi insieme alla pagina).
--
-- DOPO l'esecuzione si possono togliere il membro `ExternallyRegistered`
-- dall'enum frontend, la sua etichetta, il suo tono e il test di guardia
-- `document-labels.util.spec.ts` — non prima: `STATUS_LABELS` è un Record
-- esaustivo e quei due documenti resterebbero senza etichetta, in silenzio.
--
-- Il valore resta nell'enum PostgreSQL: `ALTER TYPE ... DROP VALUE` non esiste,
-- e ricreare il tipo su un database condiviso non vale il guadagno.

BEGIN;

-- Verifica prima: deve restituire esattamente 2 (CAR-2026-0003 e CAR-2026-0008).
SELECT count(*) AS documenti_da_normalizzare
  FROM documents
 WHERE type = 'goods_receipt'
   AND status = 'externally_registered';

UPDATE documents
   SET status = 'confirmed',
       registration_date = NULL
 WHERE type = 'goods_receipt'
   AND status = 'externally_registered';

-- Verifica dopo: deve restituire 0.
SELECT count(*) AS residui
  FROM documents
 WHERE status = 'externally_registered';

COMMIT;
