-- Profilo canale per tenant: gestionale puro, Shopify o TikTok Shop (scelta in provisioning).
CREATE TYPE "TenantChannelProfile" AS ENUM ('gestionale', 'shopify', 'tiktok_shop');

ALTER TABLE "tenants"
ADD COLUMN "channel_profile" "TenantChannelProfile" NOT NULL DEFAULT 'shopify';
