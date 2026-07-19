-- Anagrafica prodotto: sottocategoria collegata alla categoria VestiFlow e
-- note interne gestionale (mai sincronizzate con i canali).
ALTER TABLE "products" ADD COLUMN "subcategory" TEXT;
ALTER TABLE "products" ADD COLUMN "internal_notes" TEXT;

-- Vocabolario categorie/sottocategorie catalogo, gestito inline dal form
-- prodotto. I prodotti salvano i nomi come testo: il rename viene propagato
-- dal service applicativo.
CREATE TABLE "catalog_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_categories_tenant_id_parent_id_name_key" ON "catalog_categories"("tenant_id", "parent_id", "name");

CREATE INDEX "catalog_categories_tenant_id_parent_id_idx" ON "catalog_categories"("tenant_id", "parent_id");

ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
