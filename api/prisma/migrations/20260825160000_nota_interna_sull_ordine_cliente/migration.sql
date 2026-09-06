-- La NOTA INTERNA sull'ordine cliente.
--
-- PERCHE' SERVE. Ogni maschera documentale di VestiFlow ha due note: quelle
-- che escono in stampa e quelle che restano in casa. L'ordine cliente aveva
-- solo le prime, e non per una ragione funzionale: `internal_comment` esisteva
-- su `documents` e non su `sales_orders`, e la maschera si era adeguata alla
-- colonna che c'era.
--
-- Decisione del proprietario, 25/08/2026:
--
--   «Se la regola e' "Nota interna sui documenti", non ha senso che l'Ordine
--    cliente ne sia privo solo perche' storicamente SalesOrder non aveva la
--    colonna. Questa e' una differenza del modello dati, non una ragione
--    funzionale per avere una UI diversa.»
--
-- COSA NON FA, ed e' la parte che va tenuta ferma:
--   - non si stampa: e' una nota interna, e nessun modello di stampa la legge;
--   - non tocca giacenze, impegni, prezzi ne' la sincronizzazione coi canali;
--   - nessun valore predefinito: assente significa assente, e le righe gia'
--     esistenti restano a NULL senza che nessuno debba interpretarlo.
--
-- E' additiva e nullable, quindi si applica senza toccare i dati presenti e
-- senza rompere il ramo del collega, che semplicemente non la usa.

ALTER TABLE "sales_orders" ADD COLUMN "internal_comment" TEXT;

COMMENT ON COLUMN "sales_orders"."internal_comment" IS
  'Nota interna, mai in stampa. Speculare a documents.internal_comment.';
