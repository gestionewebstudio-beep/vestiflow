-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'admin', 'manager', 'clerk');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('load', 'unload', 'transfer', 'adjustment', 'sale', 'return');

-- CreateEnum
CREATE TYPE "AdjustmentDirection" AS ENUM ('increase', 'decrease');

-- CreateEnum
CREATE TYPE "MovementOrigin" AS ENUM ('manual', 'shopify');

-- CreateEnum
CREATE TYPE "ShopifySyncStatus" AS ENUM ('not_connected', 'synced', 'out_of_sync', 'syncing', 'error');

-- CreateEnum
CREATE TYPE "ShopifyConnectionStatus" AS ENUM ('not_connected', 'connected', 'reauth_required', 'error');

-- CreateEnum
CREATE TYPE "SupplierOrderStatus" AS ENUM ('draft', 'sent', 'partially_received', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "SalesOrderFinancialStatus" AS ENUM ('pending', 'authorized', 'paid', 'partially_refunded', 'refunded', 'voided');

-- CreateEnum
CREATE TYPE "SalesOrderFulfillmentStatus" AS ENUM ('unfulfilled', 'partially_fulfilled', 'fulfilled');

-- CreateEnum
CREATE TYPE "SalesOrderSource" AS ENUM ('shopify_online', 'shopify_pos', 'manual');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "auth_user_id" UUID,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'clerk',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_stores" (
    "user_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,

    CONSTRAINT "user_stores_pkey" PRIMARY KEY ("user_id","store_id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "store_id" UUID,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postal_code" TEXT,
    "country_code" TEXT,
    "shopify_location_id" TEXT,
    "shopify_sync_status" "ShopifySyncStatus" NOT NULL DEFAULT 'not_connected',
    "shopify_last_sync_at" TIMESTAMP(3),
    "shopify_last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "season" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "options" JSONB NOT NULL DEFAULT '[]',
    "shopify_product_id" TEXT,
    "shopify_sync_status" "ShopifySyncStatus" NOT NULL DEFAULT 'not_connected',
    "shopify_last_sync_at" TIMESTAMP(3),
    "shopify_last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "option_values" JSONB NOT NULL DEFAULT '[]',
    "barcode" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "selling_price_minor" INTEGER NOT NULL,
    "purchase_price_minor" INTEGER,
    "compare_at_price_minor" INTEGER,
    "shopify_variant_id" TEXT,
    "shopify_inventory_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_levels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "available" INTEGER NOT NULL DEFAULT 0,
    "committed" INTEGER NOT NULL DEFAULT 0,
    "incoming" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "min_threshold" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "origin" "MovementOrigin" NOT NULL DEFAULT 'manual',
    "variant_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "location_id" UUID NOT NULL,
    "target_location_id" UUID,
    "quantity" INTEGER NOT NULL,
    "direction" "AdjustmentDirection",
    "reason" TEXT,
    "external_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "created_by_name" TEXT NOT NULL,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "destination_location_id" UUID NOT NULL,
    "status" "SupplierOrderStatus" NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "total_minor" INTEGER NOT NULL DEFAULT 0,
    "expected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "ordered_quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_cost_minor" INTEGER NOT NULL,

    CONSTRAINT "supplier_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postal_code" TEXT,
    "country_code" TEXT,
    "shopify_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "source" "SalesOrderSource" NOT NULL DEFAULT 'manual',
    "financial_status" "SalesOrderFinancialStatus" NOT NULL DEFAULT 'pending',
    "fulfillment_status" "SalesOrderFulfillmentStatus" NOT NULL DEFAULT 'unfulfilled',
    "customer_id" UUID,
    "customer_name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
    "total_minor" INTEGER NOT NULL DEFAULT 0,
    "placed_at" TIMESTAMP(3) NOT NULL,
    "shopify_order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "total_minor" INTEGER NOT NULL,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_connections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "status" "ShopifyConnectionStatus" NOT NULL DEFAULT 'not_connected',
    "shop_domain" TEXT,
    "display_name" TEXT,
    "api_version" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_connected_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "last_error_code" TEXT,
    "last_error_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "stores_tenant_id_idx" ON "stores"("tenant_id");

-- CreateIndex
CREATE INDEX "locations_tenant_id_idx" ON "locations"("tenant_id");

-- CreateIndex
CREATE INDEX "products_tenant_id_status_idx" ON "products"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "products_tenant_id_name_idx" ON "products"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_variants_tenant_id_idx" ON "product_variants"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_tenant_id_sku_key" ON "product_variants"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "inventory_levels_tenant_id_idx" ON "inventory_levels"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_levels_location_id_idx" ON "inventory_levels"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_levels_variant_id_location_id_key" ON "inventory_levels"("variant_id", "location_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_created_at_idx" ON "stock_movements"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_variant_id_idx" ON "stock_movements"("variant_id");

-- CreateIndex
CREATE INDEX "stock_movements_location_id_idx" ON "stock_movements"("location_id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_idx" ON "suppliers"("tenant_id");

-- CreateIndex
CREATE INDEX "supplier_orders_tenant_id_status_idx" ON "supplier_orders"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_orders_tenant_id_reference_key" ON "supplier_orders"("tenant_id", "reference");

-- CreateIndex
CREATE INDEX "supplier_order_lines_order_id_idx" ON "supplier_order_lines"("order_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_last_name_idx" ON "customers"("tenant_id", "last_name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_shopify_customer_id_key" ON "customers"("tenant_id", "shopify_customer_id");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_placed_at_idx" ON "sales_orders"("tenant_id", "placed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_tenant_id_shopify_order_id_key" ON "sales_orders"("tenant_id", "shopify_order_id");

-- CreateIndex
CREATE INDEX "sales_order_lines_order_id_idx" ON "sales_order_lines"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_connections_tenant_id_key" ON "shopify_connections"("tenant_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_target_location_id_fkey" FOREIGN KEY ("target_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_order_lines" ADD CONSTRAINT "supplier_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "supplier_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_connections" ADD CONSTRAINT "shopify_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

