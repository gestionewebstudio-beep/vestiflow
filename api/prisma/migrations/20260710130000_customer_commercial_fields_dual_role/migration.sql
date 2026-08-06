-- Dati commerciali cliente e collegamento ruolo duale cliente/fornitore
ALTER TABLE "customers"
  ADD COLUMN "company_name" TEXT,
  ADD COLUMN "vat_number" TEXT,
  ADD COLUMN "customer_discount" TEXT,
  ADD COLUMN "payment_terms" TEXT,
  ADD COLUMN "commercial_notes" TEXT,
  ADD COLUMN "linked_supplier_id" UUID;

CREATE UNIQUE INDEX "customers_linked_supplier_id_key" ON "customers"("linked_supplier_id");

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_linked_supplier_id_fkey"
  FOREIGN KEY ("linked_supplier_id") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
