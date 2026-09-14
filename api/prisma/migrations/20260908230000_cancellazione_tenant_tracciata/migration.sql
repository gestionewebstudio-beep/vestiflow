-- La cancellazione amministrativa del tenant: tracciata, e ammessa a cancellare
-- lo storico dei collegamenti SOLO di quel tenant (docs/DA-FARE §10.2).
--
-- ⭐ IL PROBLEMA. Cancellare un'azienda significa cancellare anche il suo
--    storico dei collegamenti remoti — che i trigger `…_mai_delete` rifiutano
--    per costruzione. Senza un varco esplicito, un tenant con anche un solo
--    articolo pubblicato non si puo' piu' eliminare.
--
-- ⛔ E il varco NON puo' essere lo sblocco usato dai test. `ALTER TABLE …
--    DISABLE TRIGGER` e' DDL, vale per TABELLA e quindi per le righe di TUTTI
--    i tenant: la cancellazione di un'azienda aprirebbe una finestra in cui lo
--    storico di ogni altra azienda e' cancellabile.

-- ── 1 · Il valore di operazione ─────────────────────────────────────────────
-- ⚠️ Si aggiunge e basta: PostgreSQL non permette di USARE un valore di enum
--    nella stessa transazione che lo crea, e questa migration non lo usa.

ALTER TYPE "PlatformAuditOperation" ADD VALUE IF NOT EXISTS 'cancellazione_tenant';

-- ── 2 · DUE funzioni, perche' DELETE e TRUNCATE non sono la stessa cosa ─────
--
-- ⛔ **La funzione condivisa non poteva reggere il permesso.** Fino a oggi
--    `shopify_storico_non_si_cancella` serviva ENTRAMBI i trigger — quello di
--    riga (DELETE) e quello di istruzione (TRUNCATE). Un permesso che confronta
--    `OLD."tenant_id"` non ha senso in un trigger di TRUNCATE, dove `OLD` non
--    esiste: e' la stessa trappola gia' documentata per `…_nasce_agganciata`,
--    dove una funzione sola non poteva nominare campi di due tabelle diverse.
--
-- ⭐ Deciso dal proprietario l'08/09/2026: **due funzioni distinte**, cosi' che
--    non ci sia ambiguita' su che cosa e' autorizzato e che cosa non lo e'.
--
--   shopify_storico_delete_col_permesso   ammette il DELETE del SOLO tenant autorizzato
--   shopify_storico_truncate_vietato      rifiuta SEMPRE, senza eccezioni

CREATE OR REPLACE FUNCTION "shopify_storico_delete_col_permesso"()
RETURNS TRIGGER AS $$
BEGIN
  -- ⭐ Il confronto e' con `OLD.tenant_id`: a permesso acceso restano protette
  --    le righe di ogni ALTRO tenant. Non esiste un «accendi tutto», perche'
  --    il valore da impostare e' l'identificativo del tenant.
  IF current_setting('vestiflow.cancellazione_tenant', true) = OLD."tenant_id"::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'shopify_storico_non_si_cancella: % e'' storia dei collegamenti remoti e non si cancella', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

-- ⚠️ Il messaggio resta quello di prima, ed e' voluto: `check:storico-non-cancellabile`
--    e le prove di integrazione lo riconoscono, e cambiarlo qui trasformerebbe
--    una correzione in una rottura silenziosa di cio' che lo verifica.

CREATE OR REPLACE FUNCTION "shopify_storico_truncate_vietato"()
RETURNS TRIGGER AS $$
BEGIN
  -- ⛔ Nessun permesso, nessuna eccezione, nessun `current_setting`: un TRUNCATE
  --    non sa distinguere un tenant dall'altro, quindi non puo' essere
  --    autorizzato «per un tenant». Vietato e basta.
  RAISE EXCEPTION 'shopify_storico_non_si_cancella: % e'' storia dei collegamenti remoti e non si cancella', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

-- ── 3 · I dieci trigger passano alle funzioni nuove ─────────────────────────
-- ⚠️ PostgreSQL non ha `ALTER TRIGGER … EXECUTE FUNCTION`: per cambiare la
--    funzione bisogna ricreare il trigger. I NOMI restano identici — sono
--    quelli che la fixture dei test spegne uno per uno, e quelli che la guardia
--    statica verifica.

DROP TRIGGER "shopify_product_identities_mai_delete" ON "shopify_product_identities";
CREATE TRIGGER "shopify_product_identities_mai_delete"
  BEFORE DELETE ON "shopify_product_identities"
  FOR EACH ROW EXECUTE FUNCTION "shopify_storico_delete_col_permesso"();
DROP TRIGGER "shopify_product_identities_mai_truncate" ON "shopify_product_identities";
CREATE TRIGGER "shopify_product_identities_mai_truncate"
  BEFORE TRUNCATE ON "shopify_product_identities"
  FOR EACH STATEMENT EXECUTE FUNCTION "shopify_storico_truncate_vietato"();

DROP TRIGGER "shopify_variant_identities_mai_delete" ON "shopify_variant_identities";
CREATE TRIGGER "shopify_variant_identities_mai_delete"
  BEFORE DELETE ON "shopify_variant_identities"
  FOR EACH ROW EXECUTE FUNCTION "shopify_storico_delete_col_permesso"();
DROP TRIGGER "shopify_variant_identities_mai_truncate" ON "shopify_variant_identities";
CREATE TRIGGER "shopify_variant_identities_mai_truncate"
  BEFORE TRUNCATE ON "shopify_variant_identities"
  FOR EACH STATEMENT EXECUTE FUNCTION "shopify_storico_truncate_vietato"();

DROP TRIGGER "shopify_product_links_mai_delete" ON "shopify_product_links";
CREATE TRIGGER "shopify_product_links_mai_delete"
  BEFORE DELETE ON "shopify_product_links"
  FOR EACH ROW EXECUTE FUNCTION "shopify_storico_delete_col_permesso"();
DROP TRIGGER "shopify_product_links_mai_truncate" ON "shopify_product_links";
CREATE TRIGGER "shopify_product_links_mai_truncate"
  BEFORE TRUNCATE ON "shopify_product_links"
  FOR EACH STATEMENT EXECUTE FUNCTION "shopify_storico_truncate_vietato"();

DROP TRIGGER "shopify_variant_links_mai_delete" ON "shopify_variant_links";
CREATE TRIGGER "shopify_variant_links_mai_delete"
  BEFORE DELETE ON "shopify_variant_links"
  FOR EACH ROW EXECUTE FUNCTION "shopify_storico_delete_col_permesso"();
DROP TRIGGER "shopify_variant_links_mai_truncate" ON "shopify_variant_links";
CREATE TRIGGER "shopify_variant_links_mai_truncate"
  BEFORE TRUNCATE ON "shopify_variant_links"
  FOR EACH STATEMENT EXECUTE FUNCTION "shopify_storico_truncate_vietato"();

DROP TRIGGER "shopify_location_links_mai_delete" ON "shopify_location_links";
CREATE TRIGGER "shopify_location_links_mai_delete"
  BEFORE DELETE ON "shopify_location_links"
  FOR EACH ROW EXECUTE FUNCTION "shopify_storico_delete_col_permesso"();
DROP TRIGGER "shopify_location_links_mai_truncate" ON "shopify_location_links";
CREATE TRIGGER "shopify_location_links_mai_truncate"
  BEFORE TRUNCATE ON "shopify_location_links"
  FOR EACH STATEMENT EXECUTE FUNCTION "shopify_storico_truncate_vietato"();

-- ── 4 · La funzione ambigua non deve restare disponibile ────────────────────
-- ⭐ Lasciarla in giro significherebbe che un trigger nuovo puo' puntarci
--    dentro per distrazione, tornando allo stato in cui DELETE e TRUNCATE
--    condividono una regola sola. A questo punto non ha piu' dipendenti.

DROP FUNCTION "shopify_storico_non_si_cancella"();
