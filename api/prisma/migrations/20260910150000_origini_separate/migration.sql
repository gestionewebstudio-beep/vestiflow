-- La SEPARAZIONE DELLE ORIGINI: due contatori per coppia (tenant, variante, sede).
--
--   local_pending_delta      L  scostamento LOCALE non ancora trasmesso
--   channel_acquired_delta   C  effetti di CANALE gia' applicati da Shopify
--
-- PERCHE': fino a ora, guardando una variazione di `available`, non si poteva
-- dire se venisse da una vendita al banco (da trasmettere) o dall'acquisizione
-- di un ordine online (gia' avvenuta la'). Rimandare indietro la seconda
-- sottrae due volte la stessa vendita; non trasmettere la prima la perde.
--
-- NULL = base non stabilita. E' lo stato di partenza di OGNI riga esistente: la
-- base la crea la partenza controllata (docs/DA-FARE §31.-1), non il primo invio
-- ordinario. NULL non si somma mai come zero.
ALTER TABLE "shopify_inventory_sync_states"
  ADD COLUMN "local_pending_delta" INTEGER,
  ADD COLUMN "channel_acquired_delta" INTEGER;
