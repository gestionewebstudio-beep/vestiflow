-- Quando la coda del ritentativo ha ESAMINATO la riga l'ultima volta.
--
-- PERCHE': la coda si ordinava per `updated_at`, ma diversi rami di uscita del
-- push escono senza scrivere sulla riga (`base_assente`, `collegamento_escluso`,
-- `rinvio_attivo`). Quelle righe conservavano il loro `updated_at` e restavano
-- per sempre le piu' vecchie: le successive non venivano tentate mai, nemmeno a
-- passate ripetute, perche' l'ordine non cambiava. Alzare il tetto della
-- scansione non risolve — sposta il blocco piu' avanti.
--
-- `last_attempt_at` si scrive PRIMA del tentativo, qualunque sia l'esito: e' un
-- «l'ho guardata», non un «ce l'ho fatta». NULL = mai esaminata, e va in testa.
ALTER TABLE "shopify_inventory_sync_states"
  ADD COLUMN "last_attempt_at" TIMESTAMP(3);

CREATE INDEX "shopify_inventory_sync_states_tenant_id_last_attempt_at_idx"
  ON "shopify_inventory_sync_states"("tenant_id", "last_attempt_at");
