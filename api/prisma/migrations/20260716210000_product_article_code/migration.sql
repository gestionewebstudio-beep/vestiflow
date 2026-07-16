-- Codice articolo (specifica cliente §CAMPO DA AGGIUNGERE): identificatore
-- anagrafico interno VestiFlow, obbligatorio e univoco per tenant, sempre
-- in MAIUSCOLO. Migrazione articoli esistenti: progressivo numerico con
-- zero-padding a 5 cifre assegnato in ordine di data di creazione (il piu'
-- vecchio riceve 00001). L'intera migrazione gira in un'unica transazione
-- (default Prisma Migrate): nessun rischio di duplicati da interruzione.

ALTER TABLE "products" ADD COLUMN "article_code" TEXT;

-- Backfill: progressivo per tenant in ordine created_at (tie-break su id per
-- determinismo). GREATEST evita il troncamento di LPAD oltre le 5 cifre:
-- 100000+ articoli espandono naturalmente a 6+ cifre senza rompere i codici.
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM "products"
)
UPDATE "products" p
SET "article_code" = LPAD(numbered.rn::text, GREATEST(5, LENGTH(numbered.rn::text)), '0')
FROM numbered
WHERE p.id = numbered.id;

ALTER TABLE "products" ALTER COLUMN "article_code" SET NOT NULL;

-- Univoco nel sistema (per tenant): due articoli non possono condividere lo
-- stesso codice. Case-insensitive garantito a livello applicativo dalla
-- normalizzazione in maiuscolo prima di ogni scrittura.
CREATE UNIQUE INDEX "products_tenant_id_article_code_key"
  ON "products"("tenant_id", "article_code");
