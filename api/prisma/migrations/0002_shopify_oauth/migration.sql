-- Shopify OAuth credentials (encrypted token) + CSRF state table.

CREATE TABLE "shopify_credentials" (
    "tenant_id" UUID NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_credentials_pkey" PRIMARY KEY ("tenant_id")
);

CREATE TABLE "shopify_oauth_states" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopify_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopify_oauth_states_state_key" ON "shopify_oauth_states"("state");
CREATE INDEX "shopify_oauth_states_expires_at_idx" ON "shopify_oauth_states"("expires_at");

ALTER TABLE "shopify_credentials" ADD CONSTRAINT "shopify_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_oauth_states" ADD CONSTRAINT "shopify_oauth_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
