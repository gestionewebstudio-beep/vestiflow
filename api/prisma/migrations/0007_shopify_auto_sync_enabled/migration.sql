-- Flag esplicito per aggiornamenti automatici via webhook Shopify.
ALTER TABLE "shopify_connections"
  ADD COLUMN "auto_sync_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "shopify_connections"
SET "auto_sync_enabled" = true
WHERE "webhooks_activated_at" IS NOT NULL
  AND COALESCE("webhooks_active_count", 0) > 0;
