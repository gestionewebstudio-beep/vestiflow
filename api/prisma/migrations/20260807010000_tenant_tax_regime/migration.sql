-- Fattura elettronica: regime fiscale del cedente (RF01–RF19, FatturaPA).
-- Finora RegimeFiscale era hardcoded RF01 nel generatore XML: per un tenant
-- forfettario (RF19) l'XML usciva fiscalmente sbagliato senza rimedio.
-- Default RF01 (ordinario): i tenant esistenti mantengono il comportamento
-- attuale; il valore si cambia dal pannello admin.
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "tax_regime" TEXT NOT NULL DEFAULT 'RF01';
