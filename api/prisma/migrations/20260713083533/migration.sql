-- Allineamento schema ↔ migrazioni scritte a mano (drift rilevato da Prisma):
-- default a livello DB non dichiarati nello schema, precisione timestamp,
-- nomi indice, FK mancanti. Nessun effetto sui dati.

-- DropForeignKey
ALTER TABLE "document_lines" DROP CONSTRAINT IF EXISTS "document_lines_tenant_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "inventory_count_sessions_document_id_idx";

-- AlterTable
ALTER TABLE "corrispettivo_entries" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "corrispettivo_entry_lines" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "document_attachments" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "documents" ALTER COLUMN "externally_issued_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "external_document_types" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "goods_receipt_causals" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "inventory_lots" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "online_order_events" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "online_sale_lines" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "online_sales" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "purchase_invoice_goods_receipt_links" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "stock_reservation_events" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "stock_reservations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "supplier_attachments" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_table_view_preferences" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vat_codes" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vat_natures" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
-- Sostituisce l'indice parziale (WHERE source_document_id IS NOT NULL) creato
-- da 20260701200000: Prisma non esprime indici parziali, quindi lo schema
-- dichiara l'indice pieno. Drop esplicito per evitare "already exists".
DROP INDEX IF EXISTS "documents_source_document_id_type_status_idx";
CREATE INDEX "documents_source_document_id_type_status_idx" ON "documents"("source_document_id", "type", "status");

-- AddForeignKey
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_attachments" ADD CONSTRAINT "supplier_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_table_view_preferences" ADD CONSTRAINT "user_table_view_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_table_view_preferences" ADD CONSTRAINT "user_table_view_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "inventory_lots_tenant_variant_location_lot_key" RENAME TO "inventory_lots_tenant_id_variant_id_location_id_lot_code_key";

-- RenameIndex
ALTER INDEX "purchase_invoice_goods_receipt_links_invoice_receipt_key" RENAME TO "purchase_invoice_goods_receipt_links_purchase_invoice_id_go_key";

-- RenameIndex
ALTER INDEX "purchase_invoice_goods_receipt_links_tenant_invoice_idx" RENAME TO "purchase_invoice_goods_receipt_links_tenant_id_purchase_inv_idx";

-- RenameIndex
ALTER INDEX "purchase_invoice_goods_receipt_links_tenant_receipt_idx" RENAME TO "purchase_invoice_goods_receipt_links_tenant_id_goods_receip_idx";

-- RenameIndex
ALTER INDEX "user_table_view_preferences_tenant_user_view_key" RENAME TO "user_table_view_preferences_tenant_id_user_id_view_id_key";
