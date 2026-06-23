-- CreateEnum
CREATE TYPE "CatalogOrigin" AS ENUM ('vestiflow', 'shopify');

-- AlterTable
ALTER TABLE "products" ADD COLUMN "catalog_origin" "CatalogOrigin" NOT NULL DEFAULT 'vestiflow';
