-- Lo SCARICO dei contatori, fotografato alla PRESA del tentativo.
--
-- I due percorsi di scrittura scaricano `L` e `C` in modo diverso:
--
--   invio ordinario   L -= T - R              C -= R - P
--   riallineamento    L -= L_w - (A_w - T)    C -= C_w
--
-- La conferma non ha modo di sapere quale percorso ha aperto il tentativo, e
-- un discriminante piu' due rami nella stessa UPDATE sarebbe piu' fragile che
-- portarsi dietro il risultato: qui si memorizza QUANTO scaricare, deciso nel
-- momento in cui si decide che cosa inviare.
--
-- NULL e' ammesso: un tentativo aperto prima di questa migration non ha la
-- fotografia, e la conferma ripiega sulla formula dell'invio ordinario.
ALTER TABLE "shopify_inventory_sync_states"
  ADD COLUMN "pending_discharge_local" INTEGER,
  ADD COLUMN "pending_discharge_channel" INTEGER;
