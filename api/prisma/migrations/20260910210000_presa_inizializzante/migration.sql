-- Segna che questa PRESA ha fatto nascere i contatori.
--
-- Serve alla chiusura di un tentativo NON confermato: la presa inizializza `L`
-- e `C` a zero perche' i movimenti arrivati nella finestra non svaniscano su un
-- NULL, ma se poi il canale rifiuta la riga resterebbe «inizializzata» senza
-- che l'allineamento sia riuscito -- e con `L = 0` il recupero non correggerebbe
-- piu' il disallineamento, mentre con `L` NULL avrebbe ripubblicato il valore
-- assoluto.
--
-- Con questo indicatore la chiusura puo' riportare i contatori a NULL, e solo
-- quando sono ancora a zero: se nel frattempo e' arrivato un movimento, quel
-- lavoro esiste e va conservato.
ALTER TABLE "shopify_inventory_sync_states"
  ADD COLUMN "pending_ha_inizializzato" BOOLEAN;
