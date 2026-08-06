-- La modalità netto/ivato della sezione Listini NON è una proprietà dell'articolo:
-- è una preferenza dell'OPERATORE, come nei documenti (correzione cliente
-- 2026-08-03). Un flag per-articolo farebbe vedere modalità diverse aprendo
-- articoli diversi e farebbe sovrascrivere la scelta fra due operatori sugli
-- stessi articoli.
--
-- La memoria vive in "user_product_price_mode_preferences" (tenant × utente),
-- vedi migration 20260803140000_product_price_mode_preference. La forma
-- memorizzata dei listini resta il NETTO: nessun dato di prezzo viene perso qui.
ALTER TABLE "products" DROP COLUMN "listino_prices_include_vat";
