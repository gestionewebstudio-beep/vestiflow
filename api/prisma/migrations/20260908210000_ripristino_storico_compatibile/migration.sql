-- Ripristino da backup compatibile con lo storico dei collegamenti Shopify.
--
-- ⭐ IL PROBLEMA. Il ripristino di un tenant CANCELLA e RICREA le anagrafiche
--    con lo stesso `id`. Lo storico dei collegamenti non si cancella (trigger
--    `…_mai_delete`), quindi durante quella finestra le sue righe puntano a
--    prodotti, varianti e sedi che in quell'istante non ci sono piu'.
--
-- ⛔ Con `ON DELETE RESTRICT` la finestra non e' apribile: `RESTRICT` si
--    verifica SUBITO e **non e' differibile**, per specifica. Il ripristino di
--    un tenant con anche un solo articolo collegato fallirebbe sempre.
--
-- ⭐ `NO ACTION` protegge in modo identico — rifiuta la cancellazione di un
--    riferito — ma puo' essere DIFFERITO. `INITIALLY IMMEDIATE` fa si' che
--    fuori dal ripristino il comportamento resti quello di oggi: verificato
--    riga per riga, subito. Solo il ripristino dichiara `SET CONSTRAINTS …
--    DEFERRED`, per nome, dentro la propria transazione.
--
-- ⚠️ `ON UPDATE CASCADE` resta: gli `id` non cambiano, e le azioni diverse da
--    NO ACTION si eseguono comunque all'istante, indipendentemente dalla
--    differibilita'.

-- ── 1 · Le quattro FK verso l'anagrafica ────────────────────────────────────
-- ⚠️ Sono QUATTRO e non tre: la variante e' legata all'anagrafica due volte —
--    al proprio `id` col tenant, e all'appartenenza al prodotto.

ALTER TABLE "shopify_product_identities"
  DROP CONSTRAINT "shopify_product_identities_product_id_tenant_id_fkey",
  ADD CONSTRAINT "shopify_product_identities_product_id_tenant_id_fkey"
    FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products" ("id", "tenant_id")
    ON DELETE NO ACTION ON UPDATE CASCADE
    DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "shopify_variant_identities"
  DROP CONSTRAINT "shopify_variant_identities_variant_id_tenant_id_fkey",
  ADD CONSTRAINT "shopify_variant_identities_variant_id_tenant_id_fkey"
    FOREIGN KEY ("variant_id", "tenant_id") REFERENCES "product_variants" ("id", "tenant_id")
    ON DELETE NO ACTION ON UPDATE CASCADE
    DEFERRABLE INITIALLY IMMEDIATE,
  DROP CONSTRAINT "shopify_variant_identities_variante_del_prodotto_fkey",
  ADD CONSTRAINT "shopify_variant_identities_variante_del_prodotto_fkey"
    FOREIGN KEY ("variant_id", "product_id") REFERENCES "product_variants" ("id", "product_id")
    ON DELETE NO ACTION ON UPDATE CASCADE
    DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "shopify_location_pairs"
  DROP CONSTRAINT "shopify_location_pairs_location_id_tenant_id_fkey",
  ADD CONSTRAINT "shopify_location_pairs_location_id_tenant_id_fkey"
    FOREIGN KEY ("location_id", "tenant_id") REFERENCES "locations" ("id", "tenant_id")
    ON DELETE NO ACTION ON UPDATE CASCADE
    DEFERRABLE INITIALLY IMMEDIATE;

-- ── 2 · Il permesso di riga del RECUPERO SU DATABASE VUOTO ──────────────────
--
-- ⭐ IL PROBLEMA. `…_nasce_agganciata` esige che un'identita' nasca legata alla
--    propria anagrafica, ed e' la protezione che rende impossibile inventare
--    un'identita' scollegata. Ma su un database VUOTO il ripristino deve poter
--    reinserire anche le identita' che erano gia' state sganciate: quelle
--    righe hanno `product_id` NULL per costruzione, e la protezione le rifiuta.
--    Senza questo permesso, il recupero perde proprio lo storico che serve a
--    non riassegnare un GID.
--
-- ⛔ NON e' una disattivazione. Tre condizioni insieme, e tutte necessarie:
--      1. la riga deve essere davvero uno storico chiuso (`local_deleted_at`);
--      2. il permesso deve essere acceso, e lo accende solo il ripristino;
--      3. deve essere acceso PER QUEL TENANT — il valore e' il `tenant_id`.
--
-- ⭐ `current_setting(…, true)` restituisce NULL se il parametro non e' mai
--    stato impostato, invece di sollevare: e' cio' che permette a ogni altro
--    percorso di non sapere nemmeno che questo permesso esista.
--
-- ⚠️ Chi lo accende usa `set_config(…, true)`, cioe' LOCAL alla transazione:
--    al commit o al rollback sparisce da se'. Non esiste modo di lasciarlo
--    acceso, e una connessione riusata dal pool non se lo porta dietro.

CREATE OR REPLACE FUNCTION "shopify_product_identities_nasce_agganciata"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."product_id" IS NULL THEN
    IF NEW."local_deleted_at" IS NOT NULL
       AND current_setting('vestiflow.ripristino_tenant', true) = NEW."tenant_id"::text THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'shopify_product_identities_nasce_agganciata: un''identita'' nasce agganciata al proprio articolo'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "shopify_variant_identities_nasce_agganciata"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."variant_id" IS NULL THEN
    IF NEW."local_deleted_at" IS NOT NULL
       AND current_setting('vestiflow.ripristino_tenant', true) = NEW."tenant_id"::text THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'shopify_variant_identities_nasce_agganciata: un''identita'' nasce agganciata alla propria variante'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ⚠️ I TRIGGER non si ricreano: `CREATE OR REPLACE FUNCTION` cambia il corpo, e
--    i trigger esistenti puntano alla funzione per nome. Ricrearli qui
--    significherebbe doverli anche eliminare, e un `DROP TRIGGER` su queste
--    tabelle e' esattamente cio' che la guardia sorveglia.
