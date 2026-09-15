-- Le CHIAVI ESTERNE di shopify_inventory_sync_states (docs/DA-FARE §21-ter, docs/30 §9 —
-- 15/09/2026, regole proposte e provate sul database isolato).
--
-- ⛔ PERCHE'. La migration 20260713140000 ha creato la tabella SENZA chiavi esterne mentre
--    lo schema Prisma ne dichiara tre: la cancellazione di una variante lasciava il suo
--    stato orfano; quella di una sede pure (sul condiviso, letto il 15/09: 62 righe senza
--    sede su 324); e il TRUNCATE … CASCADE delle prove non raggiungeva la tabella, con
--    ripristini che cadevano a intermittenza per una riga di un'altra prova.
--
-- ⭐ LE REGOLE sono quelle di inventory_levels, che ha la stessa terna (tenant, variante,
--    sede) — lette da pg_constraint, non dedotte:
--      tenant   RESTRICT  il tenant si purga per elenco (backup, cancellazione);
--      variante CASCADE   una variante eliminata definitivamente porta via le sue giacenze,
--                         e lo stato della coppia con lei;
--      sede     RESTRICT  una sede non si elimina finche' ha giacenze, e nemmeno finche'
--                         ha stati (canDeleteLocation gia' lo conta: qui vale anche per chi
--                         non passa di la').
--
-- ⚠️ Su un database con righe orfane la migration FALLISCE, ed e' voluto: le righe si
--    tolgono con una decisione, non da una migration. Sul database di prova la tabella e'
--    vuota. Sul condiviso: nessuna applicazione senza il via e senza la pulizia decisa.
ALTER TABLE "shopify_inventory_sync_states"
  ADD CONSTRAINT "shopify_inventory_sync_states_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_inventory_sync_states_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "shopify_inventory_sync_states_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
