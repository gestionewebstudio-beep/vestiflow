-- Normalizza barcode vuoti e risolve duplicati esistenti prima del vincolo unique.
UPDATE "product_variants"
SET "barcode" = NULL
WHERE "barcode" IS NOT NULL AND btrim("barcode") = '';

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "tenant_id", lower(btrim("barcode"))
      ORDER BY "created_at", "id"
    ) AS rn
  FROM "product_variants"
  WHERE "barcode" IS NOT NULL AND btrim("barcode") <> ''
)
UPDATE "product_variants" pv
SET "barcode" = NULL
FROM ranked r
WHERE pv."id" = r."id" AND r.rn > 1;

CREATE UNIQUE INDEX "product_variants_tenant_id_barcode_key"
ON "product_variants"("tenant_id", "barcode");
