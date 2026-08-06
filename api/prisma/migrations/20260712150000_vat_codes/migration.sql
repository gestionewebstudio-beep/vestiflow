-- Codici IVA e Nature IVA (gestione IVA strutturata).
-- Catalogo di sistema vat_natures, tabella tenant vat_codes, Codice IVA
-- predefinito nelle impostazioni, Codice IVA su prodotti e righe documento
-- con snapshot, modalita' costi (netti/ivati) su Arrivo merce.
-- Migrazione retrocompatibile: i campi legacy defaultVatRatePercent /
-- vatRatePercent restano valorizzati (§7).

-- ── 1. Enum ──────────────────────────────────────────────────────────────────
CREATE TYPE "VatUsageScope" AS ENUM ('purchase', 'sales', 'both');

CREATE TYPE "VatCalculationMode" AS ENUM (
  'standard',
  'zero_rate',
  'reverse_charge',
  'split_payment',
  'margin_scheme',
  'informational'
);

CREATE TYPE "PurchaseCostEntryMode" AS ENUM ('vat_excluded', 'vat_included');

-- ── 2. Catalogo Nature IVA (di sistema, non per tenant) ─────────────────────
CREATE TABLE "vat_natures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "official_code" TEXT,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "default_usage_scope" "VatUsageScope" NOT NULL DEFAULT 'both',
  "default_calculation_mode" "VatCalculationMode" NOT NULL DEFAULT 'standard',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_system" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vat_natures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vat_natures_key_key" ON "vat_natures" ("key");
CREATE INDEX "vat_natures_sort_order_idx" ON "vat_natures" ("sort_order");

ALTER TABLE "vat_natures" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vat_natures" FROM anon, authenticated;

INSERT INTO "vat_natures"
  ("key", "official_code", "label", "description", "default_usage_scope", "default_calculation_mode", "sort_order", "updated_at")
VALUES
  ('TAXABLE',                 NULL,   'Imponibile',                                              'Operazioni imponibili con aliquota IVA ordinaria o ridotta.', 'both',     'standard',       1, CURRENT_TIMESTAMP),
  ('PURCHASE_REVERSE_CHARGE', NULL,   'Acquisto reverse charge',                                 'Acquisti con inversione contabile: IVA calcolata a parte, non dovuta al fornitore.', 'purchase', 'reverse_charge', 2, CURRENT_TIMESTAMP),
  ('SPLIT_PAYMENT',           NULL,   'Split payment',                                           'Scissione dei pagamenti verso PA.', 'both', 'split_payment', 3, CURRENT_TIMESTAMP),
  ('N1',                      'N1',   'N1: Escluso art. 15',                                     NULL, 'both', 'zero_rate', 10, CURRENT_TIMESTAMP),
  ('N2_1',                    'N2.1', 'N2.1: Non soggetto per territorialità',                   NULL, 'both', 'zero_rate', 11, CURRENT_TIMESTAMP),
  ('N2_2',                    'N2.2', 'N2.2: Non soggetto – altri casi',                         NULL, 'both', 'zero_rate', 12, CURRENT_TIMESTAMP),
  ('N3_1',                    'N3.1', 'N3.1: Non imponibile – esportazioni',                     NULL, 'both', 'zero_rate', 13, CURRENT_TIMESTAMP),
  ('N3_2',                    'N3.2', 'N3.2: Non imponibile – cessioni intracomunitarie',        NULL, 'both', 'zero_rate', 14, CURRENT_TIMESTAMP),
  ('N3_3',                    'N3.3', 'N3.3: Non imponibile – cessioni verso San Marino',        NULL, 'both', 'zero_rate', 15, CURRENT_TIMESTAMP),
  ('N3_4',                    'N3.4', 'N3.4: Non imponibile – operazioni assimilate alle esportazioni', NULL, 'both', 'zero_rate', 16, CURRENT_TIMESTAMP),
  ('N3_5',                    'N3.5', 'N3.5: Non imponibile – dichiarazioni d''intento',         NULL, 'both', 'zero_rate', 17, CURRENT_TIMESTAMP),
  ('N3_6',                    'N3.6', 'N3.6: Non imponibile – altre operazioni',                 NULL, 'both', 'zero_rate', 18, CURRENT_TIMESTAMP),
  ('N4',                      'N4',   'N4: Esente',                                              NULL, 'both', 'zero_rate', 19, CURRENT_TIMESTAMP),
  ('N5',                      'N5',   'N5: Regime del margine / IVA non esposta',                NULL, 'both', 'margin_scheme', 20, CURRENT_TIMESTAMP),
  ('N6_1',                    'N6.1', 'N6.1: Inversione contabile – cessione di rottami',        NULL, 'sales', 'reverse_charge', 21, CURRENT_TIMESTAMP),
  ('N6_2',                    'N6.2', 'N6.2: Inversione contabile – oro e argento',              NULL, 'sales', 'reverse_charge', 22, CURRENT_TIMESTAMP),
  ('N6_3',                    'N6.3', 'N6.3: Inversione contabile – subappalto edilizia',        NULL, 'sales', 'reverse_charge', 23, CURRENT_TIMESTAMP),
  ('N6_4',                    'N6.4', 'N6.4: Inversione contabile – cessione fabbricati',        NULL, 'sales', 'reverse_charge', 24, CURRENT_TIMESTAMP),
  ('N6_5',                    'N6.5', 'N6.5: Inversione contabile – telefoni cellulari',         NULL, 'sales', 'reverse_charge', 25, CURRENT_TIMESTAMP),
  ('N6_6',                    'N6.6', 'N6.6: Inversione contabile – prodotti elettronici',       NULL, 'sales', 'reverse_charge', 26, CURRENT_TIMESTAMP),
  ('N6_7',                    'N6.7', 'N6.7: Inversione contabile – comparto edile',             NULL, 'sales', 'reverse_charge', 27, CURRENT_TIMESTAMP),
  ('N6_8',                    'N6.8', 'N6.8: Inversione contabile – settore energetico',         NULL, 'sales', 'reverse_charge', 28, CURRENT_TIMESTAMP),
  ('N6_9',                    'N6.9', 'N6.9: Inversione contabile – altri casi',                 NULL, 'sales', 'reverse_charge', 29, CURRENT_TIMESTAMP),
  ('N7',                      'N7',   'N7: IVA assolta in altro Stato UE',                       NULL, 'both', 'zero_rate', 30, CURRENT_TIMESTAMP),
  ('OTHER',                   NULL,   'Altro',                                                   'Voci non riconducibili alle Nature precedenti.', 'both', 'informational', 99, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- ── 3. Tabella Codici IVA aziendali ─────────────────────────────────────────
CREATE TABLE "vat_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "nature_id" UUID NOT NULL,
  "rate_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "non_deductible_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL,
  "notes" TEXT,
  "usage_scope" "VatUsageScope" NOT NULL DEFAULT 'both',
  "calculation_mode" "VatCalculationMode" NOT NULL DEFAULT 'standard',
  "vat_affects_supplier_total" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "vat_codes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vat_codes"
  ADD CONSTRAINT "vat_codes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "vat_codes_nature_id_fkey"
    FOREIGN KEY ("nature_id") REFERENCES "vat_natures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "vat_codes_tenant_id_code_key" ON "vat_codes" ("tenant_id", "code");

-- Univocita' codice per tenant case-insensitive (§3.1).
CREATE UNIQUE INDEX "vat_codes_tenant_lower_code_key"
  ON "vat_codes" ("tenant_id", lower("code"));

-- Una sola voce predefinita per tenant (§5.3).
CREATE UNIQUE INDEX "vat_codes_tenant_default_key"
  ON "vat_codes" ("tenant_id")
  WHERE "is_default" = true AND "deleted_at" IS NULL;

CREATE INDEX "vat_codes_tenant_id_sort_order_idx" ON "vat_codes" ("tenant_id", "sort_order");
CREATE INDEX "vat_codes_tenant_id_is_active_idx" ON "vat_codes" ("tenant_id", "is_active");

ALTER TABLE "vat_codes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vat_codes" FROM anon, authenticated;

-- ── 4. Seed voci iniziali per i tenant esistenti (§4) ───────────────────────
INSERT INTO "vat_codes"
  ("tenant_id", "code", "nature_id", "rate_percent", "non_deductible_percent",
   "description", "usage_scope", "calculation_mode", "vat_affects_supplier_total",
   "is_system", "sort_order", "updated_at")
SELECT
  t."id", v.code, n."id", v.rate, 0,
  v.description, v.scope::"VatUsageScope", v.mode::"VatCalculationMode", v.affects_total,
  true, v.sort_order, CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN (VALUES
  -- Imponibili (§4.1)
  ('22',  'TAXABLE', 22.0, 'Imponibile 22%',                    'both',     'standard',       true,  1),
  ('10',  'TAXABLE', 10.0, 'Imponibile 10%',                    'both',     'standard',       true,  2),
  ('5',   'TAXABLE',  5.0, 'Imponibile 5%',                     'both',     'standard',       true,  3),
  ('4',   'TAXABLE',  4.0, 'Imponibile 4%',                     'both',     'standard',       true,  4),
  -- Voci allo 0% (§4.2)
  ('X15', 'N1',       0.0, 'Escluso art. 15 DPR 633/72',        'both',     'zero_rate',      false, 10),
  ('FC',  'N2_2',     0.0, 'Fuori campo IVA',                   'both',     'zero_rate',      false, 11),
  ('N8A', 'N3_1',     0.0, 'Non imponibile – esportazioni',     'both',     'zero_rate',      false, 12),
  ('E10', 'N4',       0.0, 'Esente art. 10 DPR 633/72',         'both',     'zero_rate',      false, 13),
  -- Acquisto reverse charge (§4.3)
  ('22R', 'PURCHASE_REVERSE_CHARGE', 22.0, 'Acquisto reverse charge 22%', 'purchase', 'reverse_charge', false, 20),
  ('10R', 'PURCHASE_REVERSE_CHARGE', 10.0, 'Acquisto reverse charge 10%', 'purchase', 'reverse_charge', false, 21),
  ('5R',  'PURCHASE_REVERSE_CHARGE',  5.0, 'Acquisto reverse charge 5%',  'purchase', 'reverse_charge', false, 22),
  ('4R',  'PURCHASE_REVERSE_CHARGE',  4.0, 'Acquisto reverse charge 4%',  'purchase', 'reverse_charge', false, 23)
) AS v(code, nature_key, rate, description, scope, mode, affects_total, sort_order)
JOIN "vat_natures" n ON n."key" = v.nature_key
ON CONFLICT DO NOTHING;

-- ── 5. Nuovi campi su impostazioni, prodotti, documenti e righe ─────────────
ALTER TABLE "tenant_feature_settings"
  ADD COLUMN "default_vat_code_id" UUID,
  ADD COLUMN "default_purchase_cost_entry_mode" "PurchaseCostEntryMode" NOT NULL DEFAULT 'vat_excluded';

ALTER TABLE "tenant_feature_settings"
  ADD CONSTRAINT "tenant_feature_settings_default_vat_code_id_fkey"
  FOREIGN KEY ("default_vat_code_id") REFERENCES "vat_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "products"
  ADD COLUMN "default_vat_code_id" UUID;

ALTER TABLE "products"
  ADD CONSTRAINT "products_default_vat_code_id_fkey"
  FOREIGN KEY ("default_vat_code_id") REFERENCES "vat_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documents"
  ADD COLUMN "purchase_cost_entry_mode" "PurchaseCostEntryMode" NOT NULL DEFAULT 'vat_excluded';

ALTER TABLE "document_lines"
  ADD COLUMN "vat_code_id" UUID,
  ADD COLUMN "vat_snapshot" JSONB,
  ADD COLUMN "entered_unit_cost" DECIMAL(16,6),
  ADD COLUMN "cost_entry_mode_snapshot" "PurchaseCostEntryMode",
  ADD COLUMN "unit_cost_net" DECIMAL(16,6),
  ADD COLUMN "unit_cost_gross" DECIMAL(16,6),
  ADD COLUMN "unit_vat_amount" DECIMAL(16,6),
  ADD COLUMN "line_vat_total_minor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "line_gross_total_minor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "supplier_payable_line_minor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reverse_charge_vat_minor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "non_deductible_vat_minor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "document_lines"
  ADD CONSTRAINT "document_lines_vat_code_id_fkey"
  FOREIGN KEY ("vat_code_id") REFERENCES "vat_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 6. Migrazione impostazione predefinita (§7.1) ───────────────────────────
-- Aliquote diverse dalle seed: crea una voce imponibile personalizzata.
INSERT INTO "vat_codes"
  ("tenant_id", "code", "nature_id", "rate_percent", "description",
   "usage_scope", "calculation_mode", "vat_affects_supplier_total", "is_system", "sort_order", "updated_at")
SELECT
  s."tenant_id",
  s."default_vat_rate_percent"::text,
  n."id",
  s."default_vat_rate_percent",
  'Imponibile ' || s."default_vat_rate_percent"::text || '%',
  'both'::"VatUsageScope", 'standard'::"VatCalculationMode", true, false, 50, CURRENT_TIMESTAMP
FROM "tenant_feature_settings" s
JOIN "vat_natures" n ON n."key" = 'TAXABLE'
WHERE NOT EXISTS (
  SELECT 1 FROM "vat_codes" c
  WHERE c."tenant_id" = s."tenant_id"
    AND c."rate_percent" = s."default_vat_rate_percent"
    AND c."calculation_mode" = 'standard'
    AND c."deleted_at" IS NULL
);

UPDATE "tenant_feature_settings" s
SET "default_vat_code_id" = (
  SELECT c."id" FROM "vat_codes" c
  WHERE c."tenant_id" = s."tenant_id"
    AND c."rate_percent" = s."default_vat_rate_percent"
    AND c."calculation_mode" = 'standard'
    AND c."deleted_at" IS NULL
  ORDER BY c."sort_order" ASC
  LIMIT 1
)
WHERE s."default_vat_code_id" IS NULL;

UPDATE "vat_codes" c
SET "is_default" = true
FROM "tenant_feature_settings" s
WHERE s."default_vat_code_id" = c."id";

-- ── 7. Migrazione righe documento esistenti (§7.2) ──────────────────────────
-- Voce tecnica 0-LEGACY per righe storiche a IVA 0 con Natura sconosciuta.
INSERT INTO "vat_codes"
  ("tenant_id", "code", "nature_id", "rate_percent", "description",
   "usage_scope", "calculation_mode", "vat_affects_supplier_total", "is_system", "is_active", "sort_order", "updated_at")
SELECT DISTINCT
  l."tenant_id", '0-LEGACY', n."id", 0,
  'IVA 0% da documento precedente',
  'both'::"VatUsageScope", 'zero_rate'::"VatCalculationMode", false, true, true, 98, CURRENT_TIMESTAMP
FROM "document_lines" l
JOIN "vat_natures" n ON n."key" = 'OTHER'
WHERE l."vat_rate_percent" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "vat_codes" c
    WHERE c."tenant_id" = l."tenant_id" AND lower(c."code") = '0-legacy'
  );

-- Aliquote storiche senza Codice IVA imponibile corrispondente: crea la voce.
INSERT INTO "vat_codes"
  ("tenant_id", "code", "nature_id", "rate_percent", "description",
   "usage_scope", "calculation_mode", "vat_affects_supplier_total", "is_system", "sort_order", "updated_at")
SELECT DISTINCT
  l."tenant_id",
  l."vat_rate_percent"::text,
  n."id",
  l."vat_rate_percent",
  'Imponibile ' || l."vat_rate_percent"::text || '%',
  'both'::"VatUsageScope", 'standard'::"VatCalculationMode", true, false, 60, CURRENT_TIMESTAMP
FROM "document_lines" l
JOIN "vat_natures" n ON n."key" = 'TAXABLE'
WHERE l."vat_rate_percent" IS NOT NULL
  AND l."vat_rate_percent" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "vat_codes" c
    WHERE c."tenant_id" = l."tenant_id"
      AND c."rate_percent" = l."vat_rate_percent"
      AND c."calculation_mode" = 'standard'
      AND c."deleted_at" IS NULL
  );

-- Collega le righe: aliquota > 0 → voce imponibile con stessa aliquota.
UPDATE "document_lines" l
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
  AND l."vat_rate_percent" > 0
  AND c."tenant_id" = l."tenant_id"
  AND c."rate_percent" = l."vat_rate_percent"
  AND c."calculation_mode" = 'standard'
  AND c."deleted_at" IS NULL;

-- Righe a IVA 0 → voce tecnica 0-LEGACY (Natura "Altro", §7.2).
UPDATE "document_lines" l
SET
  "vat_code_id" = c."id",
  "vat_snapshot" = jsonb_build_object(
    'code', c."code",
    'natureKey', 'OTHER',
    'natureLabel', 'Altro',
    'officialCode', NULL,
    'ratePercent', 0,
    'description', c."description",
    'nonDeductiblePercent', 0,
    'calculationMode', 'zero_rate',
    'vatAffectsSupplierTotal', false
  )
FROM "vat_codes" c
WHERE l."vat_code_id" IS NULL
  AND l."vat_rate_percent" = 0
  AND c."tenant_id" = l."tenant_id"
  AND lower(c."code") = '0-legacy';

-- Totali IVA riga storici: calcolo coerente con i totali gia' salvati
-- (IVA su imponibile riga, senza sconto documento: solo dato informativo,
-- i totali documento restano invariati).
UPDATE "document_lines"
SET
  "line_vat_total_minor" = ROUND("line_total_minor" * COALESCE("vat_rate_percent", 0) / 100.0),
  "line_gross_total_minor" = "line_total_minor" + ROUND("line_total_minor" * COALESCE("vat_rate_percent", 0) / 100.0),
  "supplier_payable_line_minor" = "line_total_minor" + ROUND("line_total_minor" * COALESCE("vat_rate_percent", 0) / 100.0)
WHERE "vat_rate_percent" IS NOT NULL AND "vat_rate_percent" > 0;

UPDATE "document_lines"
SET
  "line_gross_total_minor" = "line_total_minor",
  "supplier_payable_line_minor" = "line_total_minor"
WHERE "vat_rate_percent" IS NULL OR "vat_rate_percent" = 0;

-- ── 8. Migrazione Codice IVA prodotti (§8) ──────────────────────────────────
UPDATE "products" p
SET "default_vat_code_id" = (
  SELECT c."id" FROM "vat_codes" c
  WHERE c."tenant_id" = p."tenant_id"
    AND c."rate_percent" = p."default_vat_rate_percent"
    AND c."calculation_mode" IN ('standard', 'zero_rate')
    AND c."deleted_at" IS NULL
  ORDER BY CASE WHEN c."calculation_mode" = 'standard' THEN 0 ELSE 1 END, c."sort_order" ASC
  LIMIT 1
)
WHERE p."default_vat_rate_percent" IS NOT NULL
  AND p."default_vat_code_id" IS NULL;
