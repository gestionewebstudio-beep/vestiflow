-- Anagrafica fiscale/commerciale del tenant (cliente VestiFlow).
ALTER TABLE "tenants"
  ADD COLUMN "legal_name" TEXT,
  ADD COLUMN "vat_number" TEXT,
  ADD COLUMN "fiscal_code" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "pec" TEXT,
  ADD COLUMN "sdi_code" TEXT,
  ADD COLUMN "address_line1" TEXT,
  ADD COLUMN "address_line2" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "province" TEXT,
  ADD COLUMN "postal_code" TEXT,
  ADD COLUMN "country_code" TEXT;
