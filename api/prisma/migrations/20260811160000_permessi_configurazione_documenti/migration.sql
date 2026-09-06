-- Rifiniture del modello «sezioni + documenti + azioni» dopo l'audit 2026-08-11.
--
-- 1) `documents.configure` — numeratori, serie, impostazioni per tipo, causali
--    arrivo merce e tipi di documento esterno erano protetti da «gestisci una
--    famiglia QUALSIASI»: chi gestiva il solo arrivo merce poteva riscrivere i
--    prefissi delle fatture. Ora hanno una chiave propria, concessa a chi già
--    gestiva l'intero registro (tutte le famiglie principali in gestione).
-- 2) `retail.register_online` — la funzione che proteggeva è stata rimossa
--    tempo fa: la chiave non compare in nessun gate né schermata. Restava una
--    casella che prometteva qualcosa che non esiste: si toglie.

-- Chi gestisce fatture, DDT e arrivi merce stava già configurando i documenti:
-- non perde nulla. Chi gestiva solo l'arrivo merce, sì — ed è il punto.
UPDATE "users" SET "permissions" = "permissions" || ARRAY['documents.configure']
WHERE "role" <> 'owner'
  AND "permissions" @> ARRAY['doc.invoice.manage','doc.sales_ddt.manage','doc.goods_receipt.manage']
  AND NOT ("permissions" @> ARRAY['documents.configure']);

UPDATE "users" SET "permissions" = array_remove("permissions", 'retail.register_online')
WHERE 'retail.register_online' = ANY("permissions");
