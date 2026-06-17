-- Campi aggiuntivi prodotto per sync Shopify (tags, SEO, collezioni, metafields).
ALTER TABLE "products"
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "seo_title" TEXT,
  ADD COLUMN "seo_description" TEXT,
  ADD COLUMN "shopify_collections" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "shopify_metafields" JSONB NOT NULL DEFAULT '[]';
