-- La modalità costi predefinita non è più un'impostazione del tenant: è
-- sostituita dalla preferenza per operatore × tipo documento
-- (user_document_price_mode_preferences), con primo-uso «netto» per gli acquisti.
-- Vedi migration 20260730170000_document_price_mode_preference.
ALTER TABLE "tenant_feature_settings" DROP COLUMN "default_purchase_cost_entry_mode";
