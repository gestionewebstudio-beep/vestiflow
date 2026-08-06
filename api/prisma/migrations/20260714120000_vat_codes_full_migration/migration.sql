-- Estensione Codici IVA a Fornitori, Vendite online e Corrispettivi.
-- Aggiunge vatCodeId (+ vatSnapshot dove il modello fa gia' snapshot di altri
-- valori, come document_lines) e backfilla dai campi legacy percent, con lo
-- stesso approccio della migrazione 20260712150000_vat_codes: corrispondenza
-- sull'aliquota per Codici IVA attivi con lo scope adeguato (acquisto per i
-- fornitori, vendita per vendite online/corrispettivi), sintesi di una voce
-- per tenant quando l'aliquota storica non trova corrispondenza. Le colonne
-- legacy NON vengono toccate: restano valorizzate fino alla migrazione di
-- rimozione (fase 4, separata).

-- ── 1. Nuove colonne ─────────────────────────────────────────────────────────
ALTER TABLE "suppliers"
  ADD COLUMN "default_vat_code_id" UUID;

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_default_vat_code_id_fkey"
  FOREIGN KEY ("default_vat_code_id") REFERENCES "vat_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "online_sale_lines"
  ADD COLUMN "vat_code_id" UUID,
  ADD COLUMN "vat_snapshot" JSONB;

ALTER TABLE "online_sale_lines"
  ADD CONSTRAINT "online_sale_lines_vat_code_id_fkey"
  FOREIGN KEY ("vat_code_id") REFERENCES "vat_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "corrispettivo_entry_lines"
  ADD COLUMN "vat_code_id" UUID,
  ADD COLUMN "vat_snapshot" JSONB;

ALTER TABLE "corrispettivo_entry_lines"
  ADD CONSTRAINT "corrispettivo_entry_lines_vat_code_id_fkey"
  FOREIGN KEY ("vat_code_id") REFERENCES "vat_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. Backfill Fornitori (Supplier.defaultVatCodeId) ───────────────────────
-- Aliquote > 0 senza corrispondenza tra i Codici IVA attivi acquisto/entrambi:
-- crea una voce imponibile personalizzata per il tenant.
INSERT INTO "vat_codes"
  ("tenant_id", "code", "nature_id", "rate_percent", "description",
   "usage_scope", "calculation_mode", "vat_affects_supplier_total", "is_system", "sort_order", "updated_at")
SELECT DISTINCT
  s."tenant_id",
  s."default_vat_rate_percent"::text,
  n."id",
  s."default_vat_rate_percent",
  'Imponibile ' || s."default_vat_rate_percent"::text || '%',
  'both'::"VatUsageScope", 'standard'::"VatCalculationMode", true, false, 55, CURRENT_TIMESTAMP
FROM "suppliers" s
JOIN "vat_natures" n ON n."key" = 'TAXABLE'
WHERE s."default_vat_rate_percent" IS NOT NULL
  AND s."default_vat_rate_percent" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "vat_codes" c
    WHERE c."tenant_id" = s."tenant_id"
      AND c."rate_percent" = s."default_vat_rate_percent"
      AND c."calculation_mode" = 'standard'
      AND c."usage_scope" IN ('purchase', 'both')
      AND c."deleted_at" IS NULL
  );

-- Voce tecnica 0-LEGACY (Natura "Altro") per aliquota storica 0: riusa quella
-- eventualmente gia' creata dalla migrazione vat_codes per lo stesso tenant.
INSERT INTO "vat_codes"
  ("tenant_id", "code", "nature_id", "rate_percent", "description",
   "usage_scope", "calculation_mode", "vat_affects_supplier_total", "is_system", "is_active", "sort_order", "updated_at")
SELECT DISTINCT
  s."tenant_id", '0-LEGACY', n."id", 0,
  'IVA 0% da anagrafica precedente',
  'both'::"VatUsageScope", 'zero_rate'::"VatCalculationMode", false, true, true, 98, CURRENT_TIMESTAMP
FROM "suppliers" s
JOIN "vat_natures" n ON n."key" = 'OTHER'
WHERE s."default_vat_rate_percent" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "vat_codes" c
    WHERE c."tenant_id" = s."tenant_id" AND lower(c."code") = '0-legacy'
  );

UPDATE "suppliers" s
SET "default_vat_code_id" = (
  SELECT c."id" FROM "vat_codes" c
  WHERE c."tenant_id" = s."tenant_id"
    AND c."usage_scope" IN ('purchase', 'both')
    AND c."deleted_at" IS NULL
    AND (
      (s."default_vat_rate_percent" > 0 AND c."rate_percent" = s."default_vat_rate_percent" AND c."calculation_mode" = 'standard')
      OR (s."default_vat_rate_percent" = 0 AND lower(c."code") = '0-legacy')
    )
  ORDER BY c."sort_order" ASC
  LIMIT 1
)
WHERE s."default_vat_rate_percent" IS NOT NULL
  AND s."default_vat_code_id" IS NULL;

-- ── 3. Backfill Vendite online (OnlineSaleLine.vatCodeId/vatSnapshot) ───────
-- Voce imponibile personalizzata per aliquote > 0 senza corrispondenza tra i
-- Codici IVA attivi vendita/entrambi del tenant.
INSERT INTO "vat_codes"
  ("tenant_id", "code", "nature_id", "rate_percent", "description",
   "usage_scope", "calculation_mode", "vat_affects_supplier_total", "is_system", "sort_order", "updated_at")
SELECT DISTINCT
  l."tenant_id",
  l."vat_rate_percent"::text,
  n."id",
  l."vat_rate_percent",
  'Imponibile ' || l."vat_rate_percent"::text || '%',
  'both'::"VatUsageScope", 'standard'::"VatCalculationMode", true, false, 56, CURRENT_TIMESTAMP
FROM "online_sale_lines" l
JOIN "vat_natures" n ON n."key" = 'TAXABLE'
WHERE l."vat_rate_percent" IS NOT NULL
  AND l."vat_rate_percent" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "vat_codes" c
    WHERE c."tenant_id" = l."tenant_id"
      AND c."rate_percent" = l."vat_rate_percent"
      AND c."calculation_mode" = 'standard'
      AND c."usage_scope" IN ('sales', 'both')
      AND c."deleted_at" IS NULL
  );

INSERT INTO "vat_codes"
  ("tenant_id", "code", "nature_id", "rate_percent", "description",
   "usage_scope", "calculation_mode", "vat_affects_supplier_total", "is_system", "is_active", "sort_order", "updated_at")
SELECT DISTINCT
  l."tenant_id", '0-LEGACY', n."id", 0,
  'IVA 0% da vendita precedente',
  'both'::"VatUsageScope", 'zero_rate'::"VatCalculationMode", false, true, true, 98, CURRENT_TIMESTAMP
FROM "online_sale_lines" l
JOIN "vat_natures" n ON n."key" = 'OTHER'
WHERE l."vat_rate_percent" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "vat_codes" c
    WHERE c."tenant_id" = l."tenant_id" AND lower(c."code") = '0-legacy'
  );

UPDATE "online_sale_lines" l
SET
  "vat_code_id" = c."id",
  "vat_snapshot" = jsonb_build_object(
    'code', c."code",
    'natureKey', n."key",
    'natureLabel', n."label",
    'officialCode', n."official_code",
    'ratePercent', c."rate_percent",
    'description', c."description",
    'nonDeductiblePercent', c."non_deductible_percent",
    'calculationMode', c."calculation_mode",
    'vatAffectsSupplierTotal', c."vat_affects_supplier_total"
  )
FROM "vat_codes" c
JOIN "vat_natures" n ON n."id" = c."nature_id"
WHERE l."vat_code_id" IS NULL
  AND l."vat_rate_percent" IS NOT NULL
  AND c."tenant_id" = l."tenant_id"
  AND c."usage_scope" IN ('sales', 'both')
  AND c."deleted_at" IS NULL
  AND (
    (l."vat_rate_percent" > 0 AND c."rate_percent" = l."vat_rate_percent" AND c."calculation_mode" = 'standard')
    OR (l."vat_rate_percent" = 0 AND c."calculation_mode" = 'zero_rate' AND lower(c."code") = '0-legacy')
  );

-- Nessuna corrispondenza attiva per il tenant: nessuna voce fittizia, solo
-- l'aliquota derivata dal canale nello snapshot (§ non fabbricare dati).
UPDATE "online_sale_lines" l
SET "vat_snapshot" = jsonb_build_object('ratePercent', l."vat_rate_percent", 'matched', false)
WHERE l."vat_code_id" IS NULL AND l."vat_rate_percent" IS NOT NULL;

-- ── 4. Backfill Corrispettivi (CorrispettivoEntryLine.vatCodeId/vatSnapshot) ─
INSERT INTO "vat_codes"
  ("tenant_id", "code", "nature_id", "rate_percent", "description",
   "usage_scope", "calculation_mode", "vat_affects_supplier_total", "is_system", "sort_order", "updated_at")
SELECT DISTINCT
  l."tenant_id",
  l."vat_rate_percent"::text,
  n."id",
  l."vat_rate_percent",
  'Imponibile ' || l."vat_rate_percent"::text || '%',
  'both'::"VatUsageScope", 'standard'::"VatCalculationMode", true, false, 57, CURRENT_TIMESTAMP
FROM "corrispettivo_entry_lines" l
JOIN "vat_natures" n ON n."key" = 'TAXABLE'
WHERE l."vat_rate_percent" IS NOT NULL
  AND l."vat_rate_percent" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "vat_codes" c
    WHERE c."tenant_id" = l."tenant_id"
      AND c."rate_percent" = l."vat_rate_percent"
      AND c."calculation_mode" = 'standard'
      AND c."usage_scope" IN ('sales', 'both')
      AND c."deleted_at" IS NULL
  );

INSERT INTO "vat_codes"
  ("tenant_id", "code", "nature_id", "rate_percent", "description",
   "usage_scope", "calculation_mode", "vat_affects_supplier_total", "is_system", "is_active", "sort_order", "updated_at")
SELECT DISTINCT
  l."tenant_id", '0-LEGACY', n."id", 0,
  'IVA 0% da corrispettivo precedente',
  'both'::"VatUsageScope", 'zero_rate'::"VatCalculationMode", false, true, true, 98, CURRENT_TIMESTAMP
FROM "corrispettivo_entry_lines" l
JOIN "vat_natures" n ON n."key" = 'OTHER'
WHERE l."vat_rate_percent" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "vat_codes" c
    WHERE c."tenant_id" = l."tenant_id" AND lower(c."code") = '0-legacy'
  );

UPDATE "corrispettivo_entry_lines" l
SET
  "vat_code_id" = c."id",
  "vat_snapshot" = jsonb_build_object(
    'code', c."code",
    'natureKey', n."key",
    'natureLabel', n."label",
    'officialCode', n."official_code",
    'ratePercent', c."rate_percent",
    'description', c."description",
    'nonDeductiblePercent', c."non_deductible_percent",
    'calculationMode', c."calculation_mode",
    'vatAffectsSupplierTotal', c."vat_affects_supplier_total"
  )
FROM "vat_codes" c
JOIN "vat_natures" n ON n."id" = c."nature_id"
WHERE l."vat_code_id" IS NULL
  AND l."vat_rate_percent" IS NOT NULL
  AND c."tenant_id" = l."tenant_id"
  AND c."usage_scope" IN ('sales', 'both')
  AND c."deleted_at" IS NULL
  AND (
    (l."vat_rate_percent" > 0 AND c."rate_percent" = l."vat_rate_percent" AND c."calculation_mode" = 'standard')
    OR (l."vat_rate_percent" = 0 AND c."calculation_mode" = 'zero_rate' AND lower(c."code") = '0-legacy')
  );

UPDATE "corrispettivo_entry_lines" l
SET "vat_snapshot" = jsonb_build_object('ratePercent', l."vat_rate_percent", 'matched', false)
WHERE l."vat_code_id" IS NULL AND l."vat_rate_percent" IS NOT NULL;
