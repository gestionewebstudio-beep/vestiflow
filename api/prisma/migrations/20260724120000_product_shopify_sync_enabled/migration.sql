-- F0: interruttore di sincronizzazione Shopify per singolo prodotto.
-- Default true: i prodotti esistenti mantengono il comportamento attuale
-- (create/update propagano verso Shopify). I quick-add da scanner (F6) lo
-- creeranno a false. Il gate agisce nel punto di push (evaluatePushGuard),
-- in AND col gating per origine catalogo.
ALTER TABLE "products"
  ADD COLUMN "shopify_sync_enabled" BOOLEAN NOT NULL DEFAULT true;
