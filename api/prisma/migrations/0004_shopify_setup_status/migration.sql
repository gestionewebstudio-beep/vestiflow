-- Stato persistente configurazione Shopify (aggiornamenti automatici attivati).
ALTER TABLE "shopify_connections"
ADD COLUMN "webhooks_activated_at" TIMESTAMP(3),
ADD COLUMN "webhooks_active_count" INTEGER;
