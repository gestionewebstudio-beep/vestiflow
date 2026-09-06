-- Backfill: ogni vendita/reso di negozio confermato diventa una voce del
-- registro Corrispettivi (canale `store`), come le vendite da domani in poi.
-- Il reso entra con importi NEGATIVI: nel registro è uno storno, non un
-- incasso. La numerazione continua la sequenza COR esistente per tenant/anno
-- e aggiorna document_sequences, così il runtime non collide.

WITH docs AS (
  SELECT
    d."id",
    d."tenant_id",
    d."type",
    d."document_date",
    d."registration_date",
    d."created_at",
    d."subtotal_minor",
    d."tax_minor",
    d."total_minor",
    EXTRACT(YEAR FROM d."document_date")::int AS year,
    CASE WHEN d."type" = 'store_return' THEN -1 ELSE 1 END AS sign
  FROM "documents" d
  WHERE d."type" IN ('store_sale', 'store_return')
    AND d."status" = 'confirmed'
    AND NOT EXISTS (
      SELECT 1 FROM "corrispettivo_entries" e WHERE e."document_id" = d."id"
    )
),
base AS (
  SELECT "tenant_id", "year", COALESCE(MAX("number"), 0) AS last_number
  FROM "corrispettivo_entries"
  WHERE "series" = 'A'
  GROUP BY "tenant_id", "year"
),
numbered AS (
  SELECT
    docs.*,
    COALESCE(base.last_number, 0)
      + ROW_NUMBER() OVER (
          PARTITION BY docs."tenant_id", docs.year
          ORDER BY docs."created_at"
        ) AS entry_number
  FROM docs
  LEFT JOIN base ON base."tenant_id" = docs."tenant_id" AND base."year" = docs.year
),
inserted AS (
  INSERT INTO "corrispettivo_entries" (
    "id", "tenant_id", "series", "number", "year", "reference", "document_id",
    "channel", "operational_date", "fiscal_date",
    "subtotal_minor", "tax_minor", "total_minor", "discount_minor", "shipping_minor",
    "status", "created_at", "updated_at"
  )
  SELECT
    gen_random_uuid(),
    n."tenant_id",
    'A',
    n.entry_number,
    n.year,
    'COR-' || n.year || '-' || LPAD(n.entry_number::text, 4, '0'),
    n."id",
    'store',
    COALESCE(n."registration_date", n."document_date"),
    n."document_date",
    n.sign * n."subtotal_minor",
    n.sign * n."tax_minor",
    n.sign * n."total_minor",
    0,
    0,
    'to_verify',
    n."created_at",
    CURRENT_TIMESTAMP
  FROM numbered n
  RETURNING "id", "document_id"
)
INSERT INTO "corrispettivo_entry_lines" (
  "id", "tenant_id", "entry_id", "line_number", "is_shipping", "description",
  "quantity", "discount_minor", "subtotal_minor", "tax_minor", "total_minor",
  "vat_code_id", "vat_snapshot", "created_at"
)
SELECT
  gen_random_uuid(),
  dl."tenant_id",
  i."id",
  dl."line_number",
  false,
  dl."description",
  dl."quantity",
  0,
  n.sign * dl."line_total_minor",
  n.sign * dl."line_vat_total_minor",
  n.sign * dl."line_gross_total_minor",
  dl."vat_code_id",
  dl."vat_snapshot",
  dl."created_at"
FROM inserted i
JOIN numbered n ON n."id" = i."document_id"
JOIN "document_lines" dl ON dl."document_id" = i."document_id";

-- La sequenza runtime riparte dal massimo reale: niente collisioni COR.
INSERT INTO "document_sequences" ("id", "tenant_id", "type", "series", "year", "last_number", "updated_at")
SELECT gen_random_uuid(), "tenant_id", 'corrispettivo', 'A', "year", MAX("number"), CURRENT_TIMESTAMP
FROM "corrispettivo_entries"
WHERE "series" = 'A'
GROUP BY "tenant_id", "year"
ON CONFLICT ("tenant_id", "type", "series", "year")
DO UPDATE SET
  "last_number" = GREATEST("document_sequences"."last_number", EXCLUDED."last_number"),
  "updated_at" = CURRENT_TIMESTAMP;
