-- L'intestazione di chi emette, congelata sul documento al momento
-- dell'emissione.
--
-- Finora la stampa e l'XML rileggevano l'anagrafica **viva** a ogni richiesta:
-- bastava che il negozio cambiasse indirizzo perché la fattura di marzo, oggi
-- ristampata, uscisse con l'indirizzo di agosto. Su un documento fiscale non è
-- un dettaglio estetico — il documento ristampato deve essere identico a quello
-- consegnato al cliente e trasmesso allo SdI.
--
-- È lo stesso motivo per cui sulla riga si congela lo SKU e sul movimento il
-- nome di chi l'ha fatto: le anagrafiche cambiano, i documenti no.
--
-- NULL sui documenti già esistenti, e resta NULL: non si ricostruisce a
-- posteriori un'intestazione che nessuno ha registrato. Quei documenti
-- continuano a leggere l'anagrafica corrente, che è ciò che facevano comunque.

ALTER TABLE "documents" ADD COLUMN "issuer_snapshot" JSONB;
