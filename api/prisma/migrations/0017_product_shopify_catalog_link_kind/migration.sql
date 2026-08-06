-- CreateEnum
CREATE TYPE "ShopifyCatalogLinkKind" AS ENUM ('imported', 'pushed');

-- AlterTable
ALTER TABLE "products" ADD COLUMN "shopify_catalog_link_kind" "ShopifyCatalogLinkKind";
