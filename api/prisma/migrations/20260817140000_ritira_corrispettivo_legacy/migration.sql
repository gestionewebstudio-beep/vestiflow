-- Ritira il «Corrispettivo come documento autonomo».
--
-- ⚠️ NON è il Registro Corrispettivi, che resta e sta benissimo. Il Registro
-- attuale è una vista **derivata**: aggrega vendite e documenti per periodo,
-- e non ha record propri. Quello che sparisce qui è il modello precedente —
-- ogni evasione generava una `CorrispettivoEntry` con un suo numero `COR-…`,
-- un suo stato e le sue righe.
--
-- ── PERCHÉ ADESSO ──────────────────────────────────────────────────────────
-- La verticale è ferma dal 14/08/2026, e i dati lo dicono con precisione: le
-- 6 voci, le 11 righe e l'unica riga di numeratore (`last_number: 6`) portano
-- tutte lo stesso timestamp — 14/08 alle 20:53. Si è fermata tutta insieme.
--
-- Censimento del 17/08, prima di toccare:
--
--   scrittura all'evasione        già tolta dal ramo (resta un commento)
--   rotta e componente legacy     IRRAGGIUNGIBILI: `corrispettiviRegisterRoutes`
--                                 di `online-sales` non è importata da nessuno
--   documents type=corrispettivo  0
--   document_counters             0
--   movimenti con quell'origine   0
--   document_sequences            1 riga, quella dei sei
--
-- ── COSA SI TOGLIE ─────────────────────────────────────────────────────────
--   · le due tabelle e i loro dati;
--   · la riga di numeratore rimasta;
--   · nel codice: servizio, endpoint `/online-sales/register/entries`, DTO,
--     componente e rotte legacy, mapper, `CorrispettivoEntryStatus`, e il
--     valore `corrispettivo` dell'enum `DocumentType` col suo prefisso `COR`.
--
-- ── ⚠️ IL VALORE RESTA NEL TIPO POSTGRESQL, ED È DELIBERATO ────────────────
-- `ALTER TYPE ... DROP VALUE` non esiste in PostgreSQL: per togliere davvero
-- `corrispettivo` da `DocumentType` bisognerebbe ricreare il tipo e riscrivere
-- OGNI colonna che lo usa. È un rischio alto per togliere una stringa che
-- nessuno scriverà più — e nessuna riga la porta (verificato sopra).
--
-- Quindi il valore resta **morto nel tipo**, fuori dal codice e protetto dalla
-- guardia `check:registro`. È la stessa scelta già fatta il 16/08 per
-- `externally_registered`. La ricostruzione fisica dell'enum è una bonifica
-- dello schema, da fare quando ce ne saranno altri da togliere insieme.
--
-- ── ⚠️ RISCHIO MESSO A VERBALE ─────────────────────────────────────────────
-- `main` — che è ciò che gira su Railway — crea ancora una `CorrispettivoEntry`
-- DENTRO la transazione dell'evasione. Finché non è deployato questo ramo, un
-- ordine evaso su un negozio Shopify collegato manderebbe in rollback l'INTERA
-- transazione: non solo il corrispettivo, ma scarico, movimenti e stato.
--
-- Si applica lo stesso, per decisione esplicita del 17/08: nessun tenant è in
-- produzione vera, i negozi sono banchi di prova, e il codice morto va rimosso
-- una volta verificato l'uso reale invece di essere conservato per prudenza.

DELETE FROM "document_sequences" WHERE "type" = 'corrispettivo';

DROP TABLE IF EXISTS "corrispettivo_entry_lines";
DROP TABLE IF EXISTS "corrispettivo_entries";

DROP TYPE IF EXISTS "CorrispettivoStatus";
