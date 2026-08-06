-- Documento fornitore strutturato per Arrivo merce:
-- tabella tipi documento per tenant, snapshot su documents, modalita' causale,
-- date solo-giorno (DATE) e migrazione dei vecchi supplier_ref_type/external_ref.

-- ── 1. Tabella tipi documento fornitore ─────────────────────────────────────
CREATE TABLE "external_document_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "short_label" TEXT NOT NULL,
  "causal_template" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "external_document_types_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "external_document_types"
  ADD CONSTRAINT "external_document_types_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "external_document_types_tenant_id_name_key"
  ON "external_document_types" ("tenant_id", "name");

-- Univocita' nome per tenant case-insensitive (regola §6).
CREATE UNIQUE INDEX "external_document_types_tenant_lower_name_key"
  ON "external_document_types" ("tenant_id", lower("name"));

CREATE INDEX "external_document_types_tenant_id_sort_order_idx"
  ON "external_document_types" ("tenant_id", "sort_order");

ALTER TABLE "external_document_types" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "external_document_types" FROM anon, authenticated;

-- ── 2. Seed tipi di sistema per i tenant esistenti ──────────────────────────
INSERT INTO "external_document_types"
  ("tenant_id", "name", "short_label", "causal_template", "is_system", "sort_order", "updated_at")
SELECT t."id", v.name, v.short_label, v.causal_template, true, v.sort_order, CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN (VALUES
  ('DDT',     'DDT',   'DDT {numero} del {data}',   1),
  ('Fattura', 'Fatt.', 'Fatt. {numero} del {data}', 2),
  ('Reso',    'Reso',  'Reso {numero} del {data}',  3)
) AS v(name, short_label, causal_template, sort_order)
ON CONFLICT DO NOTHING;

-- ── 3. Nuovi campi su documents ──────────────────────────────────────────────
ALTER TABLE "documents"
  ADD COLUMN "external_document_type_id" UUID,
  ADD COLUMN "external_document_type_snapshot" TEXT,
  ADD COLUMN "causal_generation_mode" TEXT,
  ADD COLUMN "causal_template_snapshot" TEXT;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_external_document_type_id_fkey"
  FOREIGN KEY ("external_document_type_id") REFERENCES "external_document_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 4. Migrazione supplier_ref_type → tipi documento fornitore ──────────────
-- Valori predefiniti: ddt / invoice / return → voce di sistema corrispondente.
UPDATE "documents" d
SET
  "external_document_type_id" = edt."id",
  "external_document_type_snapshot" = edt."short_label",
  "causal_template_snapshot" = edt."causal_template"
FROM "external_document_types" edt
WHERE edt."tenant_id" = d."tenant_id"
  AND edt."name" = CASE d."supplier_ref_type"
    WHEN 'ddt' THEN 'DDT'
    WHEN 'invoice' THEN 'Fattura'
    WHEN 'return' THEN 'Reso'
    ELSE NULL
  END;

-- "other" e' un valore generico: nessun tipo collegato, solo snapshot leggibile.
UPDATE "documents"
SET "external_document_type_snapshot" = 'Altro'
WHERE "supplier_ref_type" = 'other';

-- Eventuali valori personalizzati gia' presenti → tipi aziendali senza duplicati.
INSERT INTO "external_document_types"
  ("tenant_id", "name", "short_label", "causal_template", "is_system", "sort_order", "updated_at")
SELECT DISTINCT
  d."tenant_id",
  d."supplier_ref_type",
  d."supplier_ref_type",
  d."supplier_ref_type" || ' {numero} del {data}',
  false,
  100,
  CURRENT_TIMESTAMP
FROM "documents" d
WHERE d."supplier_ref_type" IS NOT NULL
  AND d."supplier_ref_type" NOT IN ('ddt', 'invoice', 'return', 'other')
  AND NOT EXISTS (
    SELECT 1 FROM "external_document_types" e
    WHERE e."tenant_id" = d."tenant_id" AND lower(e."name") = lower(d."supplier_ref_type")
  );

UPDATE "documents" d
SET
  "external_document_type_id" = edt."id",
  "external_document_type_snapshot" = edt."short_label",
  "causal_template_snapshot" = edt."causal_template"
FROM "external_document_types" edt
WHERE d."external_document_type_id" IS NULL
  AND d."supplier_ref_type" IS NOT NULL
  AND d."supplier_ref_type" NOT IN ('ddt', 'invoice', 'return', 'other')
  AND edt."tenant_id" = d."tenant_id"
  AND lower(edt."name") = lower(d."supplier_ref_type");

-- Le causali gia' salvate non vanno mai riscritte: chi ha un testo lo conserva
-- come personalizzato (modalita' manual), gli altri restano in auto.
UPDATE "documents"
SET "causal_generation_mode" = CASE
  WHEN "causal_text" IS NOT NULL AND btrim("causal_text") <> '' THEN 'manual'
  ELSE 'auto'
END
WHERE "type" IN (
  'goods_receipt', 'supplier_ddt', 'supplier_invoice_accompanying', 'manual_load', 'initial_load'
);

ALTER TABLE "documents" DROP COLUMN "supplier_ref_type";

-- ── 5. Rif. fattura manuale (external_ref) → commento interno legacy ────────
-- Testo ambiguo: non si interpreta, si conserva senza perdita di dati (§14).
UPDATE "documents"
SET
  "internal_comment" = CASE
    WHEN "internal_comment" IS NULL OR btrim("internal_comment") = ''
      THEN 'Rif. fattura (storico): ' || "external_ref"
    ELSE "internal_comment" || E'\n' || 'Rif. fattura (storico): ' || "external_ref"
  END,
  "external_ref" = NULL
WHERE "type" IN (
  'goods_receipt', 'supplier_ddt', 'supplier_invoice_accompanying', 'manual_load', 'initial_load'
)
  AND "external_ref" IS NOT NULL
  AND btrim("external_ref") <> '';

-- ── 6. Causali: collegamento opzionale al tipo documento ────────────────────
ALTER TABLE "goods_receipt_causals"
  ADD COLUMN "external_document_type_id" UUID;

ALTER TABLE "goods_receipt_causals"
  ADD CONSTRAINT "goods_receipt_causals_external_document_type_id_fkey"
  FOREIGN KEY ("external_document_type_id") REFERENCES "external_document_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Aggiorna le causali seed legacy ("DDT ... del ...") ai modelli con segnaposto,
-- solo dove il nuovo testo non esiste gia' per il tenant.
UPDATE "goods_receipt_causals" c
SET "label" = m.new_label
FROM (VALUES
  ('DDT ... del ...',                  'DDT {numero} del {data}'),
  ('DDT ... del ... - C/Lavorazione',  'DDT {numero} del {data} - C/Lavorazione'),
  ('DDT ... del ... - C/Riparazione',  'DDT {numero} del {data} - C/Riparazione'),
  ('DDT ... del ... - C/Vendita',      'DDT {numero} del {data} - C/Vendita'),
  ('DDT ... del ... - C/Visione',      'DDT {numero} del {data} - C/Visione'),
  ('Fatt. ... del ...',                'Fatt. {numero} del {data}')
) AS m(old_label, new_label)
WHERE c."label" = m.old_label
  AND NOT EXISTS (
    SELECT 1 FROM "goods_receipt_causals" x
    WHERE x."tenant_id" = c."tenant_id" AND x."label" = m.new_label
  );

-- Collega le causali DDT/Fatt./Reso al tipo documento corrispondente.
UPDATE "goods_receipt_causals" c
SET "external_document_type_id" = edt."id"
FROM "external_document_types" edt
WHERE c."external_document_type_id" IS NULL
  AND edt."tenant_id" = c."tenant_id"
  AND edt."is_system" = true
  AND (
    (edt."name" = 'DDT' AND c."label" LIKE 'DDT %') OR
    (edt."name" = 'Fattura' AND c."label" LIKE 'Fatt.%') OR
    (edt."name" = 'Reso' AND c."label" LIKE 'Reso%')
  );

-- ── 7. Date documento solo-giorno (DATE, §2/§7) ─────────────────────────────
ALTER TABLE "documents"
  ALTER COLUMN "document_date" TYPE DATE USING "document_date"::date,
  ALTER COLUMN "external_doc_date" TYPE DATE USING "external_doc_date"::date;
