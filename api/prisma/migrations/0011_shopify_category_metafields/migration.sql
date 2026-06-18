-- Category metafields Shopify (attributi taxonomy: colore, età, tessuto, …).
ALTER TABLE "products"
  ADD COLUMN "shopify_category_metafields" JSONB NOT NULL DEFAULT '[]';
