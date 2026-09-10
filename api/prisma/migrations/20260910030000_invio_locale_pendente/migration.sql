-- Un aggiornamento LOCALE che non e' stato trasmesso al canale.
--
-- ⛔ **Perche' non riusare `mismatch_detected`.** Sarebbe bastato accenderlo, e
--    la coda del ritentativo avrebbe ripreso la riga senza toccare niente. Ma
--    quella colonna afferma una cosa precisa — «il canale porta un numero
--    diverso da quello che mi aspetto» — che si sa **guardando il canale**.
--    Qui invece non si e' guardato niente: non si e' proprio scritto. Fusi in
--    una colonna sola, i due stati diventano indistinguibili per sempre: dopo,
--    nessuno puo' piu' dire se una riga in coda sia stata verificata contro
--    Shopify o no. E hanno rimedi diversi — riconciliare le quantita' contro
--    ritrasmettere un valore.
--
-- ⭐ **Che cosa la accende**: il push che esce con `stato_cambiato`, cioe'
--    quando la coppia (Disponibile, ultimo confermato) si e' mossa sotto la
--    lettura per tre giri di presa e nessuna scrittura e' partita. Prima di
--    questa colonna quel valore restava ritrovabile **solo per caso**, alla
--    prossima vendita sullo stesso articolo: la prova `P10` lo misura.
--
-- ⭐ **Che cosa la spegne**: la conferma di un invio, oppure il constatare che
--    non c'e' piu' niente da mandare (`unchanged`). Nient'altro la tocca.
--
-- ⚠️ **Non e' una coda.** E' una colonna sulla riga che esiste gia' per quella
--    coppia, e la raccoglie il ritentativo che esiste gia'. Nessuna tabella
--    nuova, nessuno scheduler: il recupero si attiva quando l'operatore lancia
--    l'importazione delle giacenze, ed e' dichiarato cosi' perche' chiamarlo
--    automatico sarebbe falso.
ALTER TABLE "shopify_inventory_sync_states"
  ADD COLUMN "local_push_pending" BOOLEAN NOT NULL DEFAULT false;

-- ⭐ La coda seleziona ora su due colonne in OR: senza questo indice il secondo
--    ramo diventa una scansione della tabella.
CREATE INDEX "shopify_inventory_sync_states_tenant_id_local_push_pending_idx"
  ON "shopify_inventory_sync_states" ("tenant_id", "local_push_pending");
