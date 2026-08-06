-- Costi sul movimento di magazzino generato da riga Arrivo merce.
ALTER TABLE "stock_movements"
  ADD COLUMN IF NOT EXISTS "unit_cost_minor" INTEGER,
  ADD COLUMN IF NOT EXISTS "total_cost_minor" INTEGER;
