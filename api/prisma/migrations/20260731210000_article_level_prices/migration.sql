-- Prezzo/costo a livello articolo (Modello X).
-- Il prezzo di vendita e il costo di riferimento vivono sull'articolo (seed
-- delle varianti); il prezzo barrato è SOLO dell'articolo (via dalla variante).
-- La policy tenant di aggiornamento prezzo fornitore diventa una spunta
-- per-documento sull'Arrivo merce → colonna ed enum rimossi.
-- Dati di test: nessuna preservazione.

-- 1. Articolo: prezzo di vendita, prezzo barrato, costo di riferimento.
ALTER TABLE "products"
  ADD COLUMN "selling_price_minor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "compare_at_price_minor" INTEGER,
  ADD COLUMN "purchase_price_minor" INTEGER;

-- 2. Prezzo barrato: non è più un dato della variante.
ALTER TABLE "product_variants" DROP COLUMN "compare_at_price_minor";

-- 3. Policy prezzo fornitore: da impostazione tenant a spunta per-documento.
ALTER TABLE "tenant_feature_settings" DROP COLUMN "update_supplier_price_on_load";

-- 4. Enum orfano dopo la rimozione della colonna.
DROP TYPE "SupplierPriceUpdatePolicy";
