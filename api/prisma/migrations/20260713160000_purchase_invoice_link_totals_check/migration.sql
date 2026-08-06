-- "Totali da verificare" (§15): flag persistito sul collegamento fattura ↔ arrivo.
ALTER TABLE "purchase_invoice_goods_receipt_links"
  ADD COLUMN "totals_check_pending" BOOLEAN NOT NULL DEFAULT false;
