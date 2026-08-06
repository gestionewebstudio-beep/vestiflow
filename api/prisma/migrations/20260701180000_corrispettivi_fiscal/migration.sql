-- Step 6: corrispettivi fiscali e storico consegne commercialista

CREATE TYPE "SalesOrderFiscalStatus" AS ENUM (
    'pending_registration',
    'delivered_to_accountant',
    'externally_registered',
    'excluded_pos_register',
    'invoiced'
);

ALTER TABLE "sales_orders"
    ADD COLUMN "tax_minor" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "shipping_minor" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "discount_minor" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "fiscal_status" "SalesOrderFiscalStatus" NOT NULL DEFAULT 'pending_registration',
    ADD COLUMN "fiscal_delivered_at" TIMESTAMP(3),
    ADD COLUMN "fiscal_note" TEXT;

CREATE INDEX "sales_orders_tenant_id_fiscal_status_placed_at_idx"
    ON "sales_orders"("tenant_id", "fiscal_status", "placed_at" DESC);

-- POS Shopify: escluso dal flusso corrispettivi online (già gestito da cassa).
UPDATE "sales_orders"
SET "fiscal_status" = 'excluded_pos_register'
WHERE "source" = 'shopify_pos';

CREATE TABLE "corrispettivi_deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "period_from" TIMESTAMP(3) NOT NULL,
    "period_to" TIMESTAMP(3) NOT NULL,
    "channel_filter" TEXT NOT NULL,
    "order_count" INTEGER NOT NULL,
    "subtotal_minor" INTEGER NOT NULL,
    "tax_minor" INTEGER NOT NULL,
    "shipping_minor" INTEGER NOT NULL,
    "total_minor" INTEGER NOT NULL,
    "refunds_count" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by_id" UUID,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corrispettivi_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "corrispettivi_deliveries_tenant_id_created_at_idx"
    ON "corrispettivi_deliveries"("tenant_id", "created_at" DESC);

ALTER TABLE "corrispettivi_deliveries"
    ADD CONSTRAINT "corrispettivi_deliveries_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "corrispettivi_deliveries" ENABLE ROW LEVEL SECURITY;
