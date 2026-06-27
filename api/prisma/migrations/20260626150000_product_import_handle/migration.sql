-- AlterTable
ALTER TABLE "products" ADD COLUMN "import_handle" TEXT;

-- CreateIndex
CREATE INDEX "products_tenant_id_import_handle_idx" ON "products"("tenant_id", "import_handle");
