-- Il CLAIM della creazione del prodotto su Shopify (docs/30 §7.2-bis).
--
-- ⭐ PERCHE'. La creazione remota non ha una chiave di idempotenza: con una
--    risposta persa (timeout, rete, riavvio) VestiFlow non conosceva l'id del
--    prodotto creato e alla ripubblicazione ne creava un SECONDO — riprodotto
--    il 15/09/2026 nell'ambiente isolato, e sul negozio vero la seconda
--    creazione con la stessa identita' viene rifiutata solo se l'identita'
--    c'e' (prova di contratto G2/G3). Qui si registra, PRIMA di chiamare
--    Shopify, chi sta creando che cosa e verso quale negozio:
--
--    - claim_id       l'uuid del singolo tentativo;
--    - claim_version  numero monotono: ogni scrittura del tentativo (id
--                     salvati, errore, rilascio) e OGNI chiamata remota
--                     successiva sono condizionate alla propria versione — un
--                     proprietario superato non scrive e non chiama piu';
--    - claim_shop_id  il negozio di destinazione per identita' (GID), non per
--                     dominio: il webhook anticipato adotta solo se coincide;
--    - claimed_at     quando; la scadenza permette di RECUPERARE il lavoro, non
--                     dimostra che il tentativo precedente sia finito.
--
-- ⚠️ Nessuna riga esistente cambia significato: claim assente = nessuna
--    creazione in corso, come prima. La versione parte da 0.
ALTER TABLE "products"
  ADD COLUMN "shopify_create_claim_id"      UUID,
  ADD COLUMN "shopify_create_claim_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shopify_create_claim_shop_id" UUID,
  ADD COLUMN "shopify_create_claimed_at"    TIMESTAMP(3);

ALTER TABLE "products"
  ADD CONSTRAINT "products_shopify_create_claim_shop_id_fkey"
  FOREIGN KEY ("shopify_create_claim_shop_id") REFERENCES "shopify_shops"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Chi cerca «i prodotti con una creazione aperta verso questo negozio» (webhook
-- anticipato, ripresa) non deve scandire la tabella.
CREATE INDEX "products_shopify_create_claim_shop_id_idx"
  ON "products"("shopify_create_claim_shop_id")
  WHERE "shopify_create_claim_id" IS NOT NULL;
