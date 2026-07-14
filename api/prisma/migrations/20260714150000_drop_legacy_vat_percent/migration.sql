-- Fase 4 migrazione IVA: rimozione dei campi legacy aliquota % intera, ora
-- completamente sostituiti dal Codice IVA strutturato (vatCodeId/defaultVatCodeId
-- + vatSnapshot dove applicabile) su ogni dominio, con dual-write completato
-- nelle fasi 1-3 e backfill applicato dalle migrazioni 20260712150000_vat_codes
-- e 20260714120000_vat_codes_full_migration.
--
-- Verifica pre-drop eseguita a mano sul DB di sviluppo (nessuna riga con
-- valore legacy valorizzato e sostituto strutturato NULL, su tutte e sei le
-- tabelle): sicuro procedere, nessuna perdita di informazione.

ALTER TABLE "products"
  DROP COLUMN "default_vat_rate_percent";

ALTER TABLE "suppliers"
  DROP COLUMN "default_vat_rate_percent";

ALTER TABLE "online_sale_lines"
  DROP COLUMN "vat_rate_percent";

ALTER TABLE "corrispettivo_entry_lines"
  DROP COLUMN "vat_rate_percent";

ALTER TABLE "tenant_feature_settings"
  DROP COLUMN "default_vat_rate_percent";

ALTER TABLE "document_lines"
  DROP COLUMN "vat_rate_percent";
