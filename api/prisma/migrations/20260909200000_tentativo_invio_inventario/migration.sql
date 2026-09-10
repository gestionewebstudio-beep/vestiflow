-- Il TENTATIVO di invio inventario, persistente e ripetibile dopo un riavvio.
--
-- ⛔ PERCHE' NON SI RIUSA `last_pushed_available` COME PRENOTAZIONE.
--    Un aggiornamento condizionato su quella colonna fa vincere un solo
--    esecutore — e' vero — ma le assegna un secondo significato: «ultimo
--    confermato» diventerebbe «ultimo prenotato». Se il processo morisse fra la
--    prenotazione e l'invio, la riga direbbe che una quantita' e' stata
--    trasmessa mentre non e' mai partita, e nessun recupero potrebbe accorgersene.
--    La prenotazione riguarda il TENTATIVO; la conferma resta separata.
--
-- ⭐ PERCHE' NON UNA CODA.
--    L'operazione in corso su una coppia variante x sede e' UNA. La riga di
--    stato esiste gia' ed e' unica per (tenant, variante, sede): tenere li' il
--    tentativo aperto non introduce nessuna struttura nuova, nessun worker e
--    nessun ordinamento da mantenere.
--
-- ⚠️ PERCHE' SETTE COLONNE E NON TRE.
--    «Ripetere esattamente la stessa operazione» richiede la chiave, il valore,
--    il confronto usato, la destinazione (negozio, articolo di inventario, sede
--    remota) e l'istante. La destinazione va conservata perche' gli
--    identificativi remoti sull'anagrafica possono cambiare fra il tentativo e
--    il recupero: ripetere verso una destinazione diversa sarebbe un'operazione
--    NUOVA travestita da ripetizione.
--
-- ⚠️ `pending_base` NULLABILE ha un significato: NULL = inviato SENZA confronto,
--    che e' il caso in cui non esiste ancora un ultimo confermato da cui
--    partire. Distinguerlo da «confronto con zero» e' necessario.
--
-- ⛔ NESSUN VALORE PREDEFINITO E NESSUN BACKFILL: le righe esistenti non hanno
--    tentativi aperti, e inventarne uno significherebbe farli recuperare.

ALTER TABLE "shopify_inventory_sync_states"
  ADD COLUMN "pending_key" TEXT,
  ADD COLUMN "pending_available" INTEGER,
  ADD COLUMN "pending_base" INTEGER,
  ADD COLUMN "pending_shop_domain" TEXT,
  ADD COLUMN "pending_item_id" TEXT,
  ADD COLUMN "pending_location_ref" TEXT,
  ADD COLUMN "pending_at" TIMESTAMP(3);

-- La chiave di idempotenza identifica UNA operazione: due righe non possono
-- condividerla. E' anche la garanzia che un secondo esecutore non possa
-- riusare la chiave di un'altra coppia.
CREATE UNIQUE INDEX "shopify_inventory_sync_states_pending_key_key"
  ON "shopify_inventory_sync_states" ("pending_key");

-- I tentativi aperti si cercano per anzianita': e' la lettura del recupero.
--
-- ⚠️ Indice PIENO, non parziale: un `WHERE` qui non e' esprimibile in Prisma, e
--    una divergenza fra lo schema dichiarato e il database e' esattamente il
--    difetto che questo progetto ha gia' pagato (`DA-FARE` §21-ter).
CREATE INDEX "shopify_inventory_sync_states_tenant_id_pending_at_idx"
  ON "shopify_inventory_sync_states" ("tenant_id", "pending_at");
