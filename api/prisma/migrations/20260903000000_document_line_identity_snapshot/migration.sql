-- ⭐ L'IDENTITÀ DELL'ARTICOLO DIVENTA UNO SNAPSHOT DELLA RIGA — Tranche 0A.2a,
--    03/09/2026, `docs/24` §5.2.
--
-- ⛔ IL DIFETTO CHE CHIUDE. Codice articolo, nome prodotto e barcode NON erano
--    colonne di `document_lines`: la maschera li rileggeva dall'anagrafica
--    CORRENTE a ogni apertura del documento, e il codice lo dichiarava senza
--    giri di parole —
--
--      «riempire le righe CARICATE, che `document_lines` non persiste
--       (articleCode, barcode, supplierSku non hanno una colonna da cui
--        ricaricarsi)»
--                    goods-receipt-form.component.ts
--
--    Conseguenza: rinominare un articolo riscriveva i documenti già emessi, e
--    una variante eliminata li lasciava senza — perché la riga la ritrovava
--    solo passando dal collegamento alla variante, che su `document_lines` è
--    `ON DELETE SET NULL`.
--
-- ⭐ NULLABLE, e per due ragioni diverse che conviene tenere distinte:
--
--      1. una riga di SPESA o SERVIZIO non ha un articolo: `null` è il suo
--         stato corretto, non un dato mancante;
--      2. le righe scritte PRIMA di oggi non hanno questi valori, e non si
--         inventa un passato — `docs/24` §5.4: «non dobbiamo inventare una
--         fotografia del passato». Nessun backfill dall'anagrafica corrente:
--         darebbe a un documento di marzo il nome che l'articolo ha oggi, e
--         sarebbe indistinguibile da una fotografia vera.
--
-- ⚠️ ADDITIVA: tre colonne nullable, nessun vincolo, nessun default, nessun
--    indice. Su un database CONDIVISO fra rami è l'operazione più sicura
--    possibile — nessuna riga esistente viene riscritta, e un ramo che non
--    conosce queste colonne continua a funzionare.
--
-- ⚠️ NIENTE `supplierSku`: il commento citato sopra ne nomina tre, ma quello
--    appartiene al percorso Arrivo merce, che questa tranche non tocca.

ALTER TABLE "document_lines" ADD COLUMN "article_code" TEXT;
ALTER TABLE "document_lines" ADD COLUMN "product_name" TEXT;
ALTER TABLE "document_lines" ADD COLUMN "barcode" TEXT;
