-- Prezzo di CANALE (Shopify) separato dal prezzo ARTICOLO, tre listini aggiuntivi
-- e la modalità netto/ivato della sezione Listini, più la config dei listini a
-- livello tenant.
--
-- Il prezzo Shopify diventa l'UNICO campo toccato dalla sync; il prezzo articolo
-- (selling_price_minor) resta il prezzo del gestionale, che nessuna sync tocca.

-- 1. Articolo: prezzo Shopify, tre listini aggiuntivi, modalità della sezione.
-- Il prezzo Shopify ha sempre un valore proprio (NOT NULL): default 0 in add,
-- poi seminato dal prezzo articolo sotto (punto 4).
ALTER TABLE "products"
  ADD COLUMN "shopify_price_minor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "listino1_price_minor" INTEGER,
  ADD COLUMN "listino2_price_minor" INTEGER,
  ADD COLUMN "listino3_price_minor" INTEGER,
  ADD COLUMN "listino_prices_include_vat" BOOLEAN NOT NULL DEFAULT true;

-- 2. Variante: prezzo Shopify per-taglia (NOT NULL, seminato sotto).
ALTER TABLE "product_variants"
  ADD COLUMN "shopify_price_minor" INTEGER NOT NULL DEFAULT 0;

-- 3. Tenant: nome + attivazione dei tre listini aggiuntivi.
ALTER TABLE "tenant_feature_settings"
  ADD COLUMN "listino1_name" TEXT,
  ADD COLUMN "listino1_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "listino2_name" TEXT,
  ADD COLUMN "listino2_active" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "listino3_name" TEXT,
  ADD COLUMN "listino3_active" BOOLEAN NOT NULL DEFAULT false;

-- 4. Semina il prezzo Shopify dai valori attuali: alla prima sincronizzazione
--    il payload di pubblicazione dev'essere IDENTICO a prima (gate B2).
UPDATE "products" SET "shopify_price_minor" = "selling_price_minor";
UPDATE "product_variants" SET "shopify_price_minor" = "selling_price_minor";
