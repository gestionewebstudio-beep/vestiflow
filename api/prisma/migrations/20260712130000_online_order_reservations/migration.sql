-- FASE 1 — Giacenza / Impegnata / Disponibile e ordini online.
-- Impegni correnti (stock_reservations), storico eventi di impegno,
-- registro eventi canonici ordine online (idempotenza multicanale),
-- id riga esterna stabile sulle righe ordine, stati annullato/evaso/da
-- verificare sugli ordini di vendita.

-- ── 1. Enum ──────────────────────────────────────────────────────────────────
CREATE TYPE "ReservationStatus" AS ENUM ('active', 'consumed', 'released');

CREATE TYPE "ReservationEventType" AS ENUM ('created', 'updated', 'consumed', 'released');

CREATE TYPE "OnlineOrderEventType" AS ENUM (
  'online_order_created',
  'online_order_updated',
  'online_order_cancelled',
  'online_order_fulfilled',
  'online_order_partially_fulfilled',
  'online_order_refunded',
  'online_order_restocked'
);

-- ── 2. Righe ordine: id riga esterna stabile (chiave idempotenza) ────────────
ALTER TABLE "sales_order_lines"
  ADD COLUMN "external_line_id" TEXT;

CREATE UNIQUE INDEX "sales_order_lines_order_id_external_line_id_key"
  ON "sales_order_lines" ("order_id", "external_line_id");

-- ── 3. Ordini: annullamento, evasione, richiede verifica ────────────────────
ALTER TABLE "sales_orders"
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "fulfilled_at" TIMESTAMP(3),
  ADD COLUMN "external_fulfillment_id" TEXT,
  ADD COLUMN "requires_review" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "review_reason" TEXT;

-- ── 4. Impegni correnti ──────────────────────────────────────────────────────
CREATE TABLE "stock_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "channel" "SalesOrderSource" NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "sales_order_line_id" UUID,
  "sku" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "remaining_quantity" INTEGER NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'active',
  "external_order_ref" TEXT,
  "external_line_ref" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_reservations_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_reservations_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_reservations_sales_order_id_fkey"
    FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_reservations_sales_order_line_id_fkey"
    FOREIGN KEY ("sales_order_line_id") REFERENCES "sales_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "stock_reservations_sales_order_line_id_key"
  ON "stock_reservations" ("sales_order_line_id");

CREATE INDEX "stock_reservations_tenant_id_variant_id_location_id_status_idx"
  ON "stock_reservations" ("tenant_id", "variant_id", "location_id", "status");

CREATE INDEX "stock_reservations_tenant_id_sales_order_id_idx"
  ON "stock_reservations" ("tenant_id", "sales_order_id");

CREATE INDEX "stock_reservations_location_id_idx" ON "stock_reservations" ("location_id");
CREATE INDEX "stock_reservations_variant_id_idx" ON "stock_reservations" ("variant_id");

ALTER TABLE "stock_reservations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "stock_reservations" FROM anon, authenticated;

-- ── 5. Storico eventi di impegno ─────────────────────────────────────────────
CREATE TABLE "stock_reservation_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "type" "ReservationEventType" NOT NULL,
  "quantity_delta" INTEGER NOT NULL,
  "remaining_after" INTEGER NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_reservation_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_reservation_events"
  ADD CONSTRAINT "stock_reservation_events_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_reservation_events_reservation_id_fkey"
    FOREIGN KEY ("reservation_id") REFERENCES "stock_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "stock_reservation_events_tenant_id_created_at_idx"
  ON "stock_reservation_events" ("tenant_id", "created_at" DESC);

CREATE INDEX "stock_reservation_events_reservation_id_idx"
  ON "stock_reservation_events" ("reservation_id");

ALTER TABLE "stock_reservation_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "stock_reservation_events" FROM anon, authenticated;

-- ── 6. Registro eventi canonici ordine online ────────────────────────────────
CREATE TABLE "online_order_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "channel" "SalesOrderSource" NOT NULL,
  "type" "OnlineOrderEventType" NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "external_order_id" TEXT NOT NULL,
  "dedupe_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "online_order_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "online_order_events"
  ADD CONSTRAINT "online_order_events_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "online_order_events_sales_order_id_fkey"
    FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "online_order_events_tenant_id_dedupe_key_key"
  ON "online_order_events" ("tenant_id", "dedupe_key");

CREATE INDEX "online_order_events_tenant_id_sales_order_id_created_at_idx"
  ON "online_order_events" ("tenant_id", "sales_order_id", "created_at" DESC);

ALTER TABLE "online_order_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "online_order_events" FROM anon, authenticated;
