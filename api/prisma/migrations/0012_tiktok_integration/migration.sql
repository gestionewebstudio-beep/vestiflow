-- TikTok Shop integration: connessione OAuth, campi sync su prodotti/varianti, origine movimenti.

-- CreateEnum
CREATE TYPE "TikTokConnectionStatus" AS ENUM ('not_connected', 'connected', 'reauth_required', 'error');
CREATE TYPE "TikTokSyncStatus" AS ENUM ('not_connected', 'synced', 'out_of_sync', 'syncing', 'error');

-- AlterEnum
ALTER TYPE "MovementOrigin" ADD VALUE 'tiktok';

-- AlterTable products
ALTER TABLE "products" ADD COLUMN "tiktok_category_id" TEXT,
ADD COLUMN "tiktok_product_id" TEXT,
ADD COLUMN "tiktok_sync_status" "TikTokSyncStatus" NOT NULL DEFAULT 'not_connected',
ADD COLUMN "tiktok_last_sync_at" TIMESTAMP(3),
ADD COLUMN "tiktok_last_error" TEXT;

CREATE INDEX "products_tenant_id_tiktok_product_id_idx" ON "products"("tenant_id", "tiktok_product_id");

-- AlterTable product_variants
ALTER TABLE "product_variants" ADD COLUMN "tiktok_sku_id" TEXT;

-- TikTok connection tables
CREATE TABLE "tiktok_connections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "status" "TikTokConnectionStatus" NOT NULL DEFAULT 'not_connected',
    "shop_id" TEXT,
    "shop_cipher" TEXT,
    "display_name" TEXT,
    "region" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_connected_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "last_error_code" TEXT,
    "last_error_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tiktok_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tiktok_connections_tenant_id_key" ON "tiktok_connections"("tenant_id");

CREATE TABLE "tiktok_credentials" (
    "tenant_id" UUID NOT NULL,
    "shop_id" TEXT NOT NULL,
    "shop_cipher" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tiktok_credentials_pkey" PRIMARY KEY ("tenant_id")
);

CREATE TABLE "tiktok_oauth_states" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiktok_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tiktok_oauth_states_state_key" ON "tiktok_oauth_states"("state");
CREATE INDEX "tiktok_oauth_states_expires_at_idx" ON "tiktok_oauth_states"("expires_at");

ALTER TABLE "tiktok_connections" ADD CONSTRAINT "tiktok_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tiktok_credentials" ADD CONSTRAINT "tiktok_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tiktok_oauth_states" ADD CONSTRAINT "tiktok_oauth_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tiktok_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tiktok_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tiktok_oauth_states" ENABLE ROW LEVEL SECURITY;
