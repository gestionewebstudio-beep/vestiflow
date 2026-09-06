-- L'unità di misura della riga documento, dove ancora non c'era.
--
-- Il documento è una fotografia: la riga cattura l'U.M. all'inserimento e la
-- tiene per sé, indipendente da come cambia l'anagrafica dopo — come già fa col
-- prezzo e col costo (specifica righe documento §4.3-ter).
--
-- `sales_order_lines` la colonna ce l'aveva già. Queste due la portano dove
-- mancava, e coprono cinque tipi documento:
--   document_lines       → Arrivo merce, Carico manuale, Carico iniziale,
--                          Preventivi, DDT vendita, Scarico manuale
--   supplier_order_lines → Ordine fornitore
--
-- In `supplier_order_lines` mancava pur essendoci un campo editabile in
-- maschera: si modificava, si salvava, si riapriva e la modifica era sparita,
-- senza un errore. Additiva e nullable: le righe già salvate restano come sono,
-- e in lettura l'assenza vale «prendi il valore dell'anagrafica».

ALTER TABLE "document_lines" ADD COLUMN "unit_of_measure" TEXT;

ALTER TABLE "supplier_order_lines" ADD COLUMN "unit_of_measure" TEXT;
