-- Ritiro dei doppioni SINTETICI dei Tipi pagamento (solo dati, nessuno schema).
--
-- IL FATTO, misurato in sola lettura sul database condiviso il 06/09/2026:
-- tutti e quattro i tenant portano DUE generazioni di seed insieme. Trenta Tipi
-- «metodo» ciascuno, di cui cinque coppie che nominano lo stesso codice
-- normativo, e in tutti e quattro ENTRAMBE le voci di ogni coppia sono attive.
-- Venti coppie attive in tutto.
--
-- ⛔ **NON e' una deduplica generica per codice normativo, e la differenza e'
--    tutta qui.** Piu' Tipi pagamento distinti che puntano allo stesso `MPxx`
--    sono LEGITTIMI: un'azienda puo' volere «Carta — banco» e «Carta — online»,
--    entrambi MP08, e vederli separati nei riepiloghi. Una regola che ritirasse
--    per codice li spegnerebbe, e sarebbe un difetto peggiore del doppione.
--
-- ⭐ **Si ritira SOLO cio' che il progetto ha seminato due volte**, riconosciuto
--    per NOME LETTERALE esatto delle due generazioni di seed. Cinque coppie,
--    scritte qui una per una: non c'e' euristica, non c'e' `LIKE`, non c'e'
--    estrazione del codice dal nome.
--
-- ⚠️ **La Cassa continua a mostrare tutte le opzioni ATTIVE.** Questa migration
--    non tocca la presentazione: riduce il numero di voci attive, che e' un'altra
--    cosa e si vede in ogni elenco, non solo al banco.

-- ⛔ NESSUNA RIGA VIENE CANCELLATA. Si spegne `is_active`, e basta.
--
--    Le quote gia' incassate (`store_sale_payments`) e gli snapshot storici
--    restano leggibili: il riferimento `payment_option_id` continua a risolvere
--    su una riga che esiste, e `option_name_snapshot` conserva comunque il nome
--    che il documento portava. Cancellare avrebbe azzerato il riferimento
--    (`ON DELETE SET NULL`) e lasciato la quota senza origine.
--
-- ⭐ **E' IDEMPOTENTE**: la condizione `is_active = true` sulla riga sintetica
--    smette di reggere dopo la prima applicazione, quindi una seconda passata
--    aggiorna zero righe.
UPDATE "payment_options" AS sintetica
   SET "is_active" = false,
       "updated_at" = CURRENT_TIMESTAMP
  FROM (VALUES
    -- storica (seed vecchio)   sintetica (seed nuovo)        codice
    ('Contanti',                'Contanti (MP01)',            'MP01'),
    ('Assegno',                 'Assegno (MP02)',             'MP02'),
    ('Bonifico bancario',       'Bonifico (MP05)',            'MP05'),
    ('Carta di pagamento',      'Carta di pagamento (MP08)',  'MP08'),
    ('RiBa',                    'RIBA (MP12)',                'MP12')
  ) AS coppia("storica", "sintetica", "codice")
  JOIN "payment_method_codes" pmc ON pmc."code" = coppia."codice"
 WHERE sintetica."name" = coppia."sintetica"
   AND sintetica."kind" = 'method'
   -- ⛔ Solo voci DI SISTEMA: una creata dall'utente non si tocca, nemmeno se
   --    per caso si chiamasse cosi'.
   AND sintetica."is_system" = true
   -- ⛔ E solo se e' ancora attiva: se il titolare l'ha gia' spenta, non c'e'
   --    niente da fare, e riscriverla sarebbe rumore in `updated_at`.
   AND sintetica."is_active" = true
   -- ⛔ Il collegamento normativo deve essere QUELLO ATTESO. Un nome giusto con
   --    un codice diverso non e' la coppia del seed: e' qualcosa che qualcuno
   --    ha rimappato, e va lasciato stare.
   AND sintetica."method_code_id" = pmc."id"
   -- ⭐ **La condizione che rende la coppia una coppia**: la voce storica deve
   --    esistere NELLO STESSO TENANT, essere anch'essa di sistema, ATTIVA e
   --    collegata allo stesso codice. Se manca, o se e' spenta, la sintetica
   --    resta accesa — altrimenti si lascerebbe il tenant senza nessuna voce
   --    attiva per quel codice, che e' molto peggio di un doppione.
   AND EXISTS (
     SELECT 1
       FROM "payment_options" storica
      WHERE storica."tenant_id" = sintetica."tenant_id"
        AND storica."name" = coppia."storica"
        AND storica."kind" = 'method'
        AND storica."is_system" = true
        AND storica."is_active" = true
        AND storica."method_code_id" = pmc."id"
   );

-- ⚠️ **CHE COSA QUESTA MIGRATION NON FA, e perche'.**
--
-- · Non riattiva la voce storica se e' spenta. Il titolare puo' averla spenta
--   apposta, e riaccenderla sarebbe decidere al posto suo.
-- · Non sposta riferimenti da una voce all'altra. Oggi non ce ne sono — misurato:
--   nessuna riga referenzia `payment_options` sul condiviso — e spostarli
--   riscriverebbe documenti storici, che e' vietato dalla regola della
--   fotografia (`regole-gestionale`).
-- · Non tocca le voci senza equivalente storico: le altre diciotto `(MPxx)` per
--   tenant restano attive, perche' sono l'unica voce di quel codice.
-- · Non cambia il seed dei tenant NUOVI: quello genera gia' i soli nomi `(MPxx)`,
--   quindi il doppione non si riproduce. Questa migration riguarda solo i quattro
--   tenant esistenti.
