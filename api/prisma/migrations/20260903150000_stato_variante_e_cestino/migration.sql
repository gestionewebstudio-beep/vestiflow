-- Tranche 1A — fondazione del modello locale del ciclo di vita (docs/24 §§1, 3, 4).
--
-- Due cose nuove, su due assi DIVERSI che non vanno confusi (§3.7):
--
--   1 · lo STATO LOCALE della variante — «Attiva» / «Non attiva» — che finora
--       non esisteva: la variante ereditava tutto dal prodotto, e «non attiva»
--       si poteva esprimere solo a colpi di quantità zero o `inventoryPolicy`,
--       cioè con dati che significano altro (§3.1 lo vieta);
--
--   2 · il CESTINO, per prodotto e variante — una cancellazione LOGICA
--       reversibile che conserva anagrafica, giacenze, impegni e movimenti
--       (§4.1). `deleted_at IS NOT NULL` significa «nel cestino».
--
-- ⛔ `deleted_at` NON significa «eliminato definitivamente». L'eliminazione
--    definitiva è la RIMOZIONE FISICA del record (§4.2) e non ha bisogno di
--    una colonna: dopo la purga il record non c'è più. Per la stessa ragione
--    NON si aggiunge un valore `deleted` a `ProductStatus`: sarebbero due
--    fonti per lo stesso fatto (§3.2). `archived` resta «prodotto Non attivo».
--
-- ⭐ Tutto ADDITIVO e senza backfill: nessuna riga esistente cambia significato.
--    `lifecycle_status` nasce `active` per ogni variante — è la verità di oggi.
--    Le tre colonne del cestino nascono NULL — nessuno è nel cestino.
--
-- ⚠️ Nessun filtro applicativo cambia con questa migration: le query continuano
--    a vedere tutto. È deliberato — è la Tranche 1B a introdurre i filtri, e una
--    colonna che nessuno legge ancora non può escludere righe per sbaglio.
--
-- `deleted_by_id` è uno snapshot d'audit SENZA vincolo referenziale, come
-- `stock_movements.created_by_id`: eliminare un utente non deve toccare il
-- cestino, e il nome si ricostruisce dall'audit, non dalla FK.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · STATO LOCALE DELLA VARIANTE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE "VariantLifecycleStatus" AS ENUM ('active', 'inactive');

ALTER TABLE "product_variants"
  ADD COLUMN "lifecycle_status" "VariantLifecycleStatus" NOT NULL DEFAULT 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · CESTINO — prodotto
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "products"
  ADD COLUMN "deleted_at"      TIMESTAMP(3),
  ADD COLUMN "deleted_by_id"   UUID,
  ADD COLUMN "deletion_reason" TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · CESTINO — variante
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "product_variants"
  ADD COLUMN "deleted_at"      TIMESTAMP(3),
  ADD COLUMN "deleted_by_id"   UUID,
  ADD COLUMN "deletion_reason" TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · INDICI — per tenant, stato e cestino
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `products(tenant_id, status)` esiste già. Si aggiunge il cestino per entrambe
-- le tabelle e lo stato locale per la variante: sono i predicati di §3.4
-- (`deleted_at IS NULL AND lifecycle_status = 'active'`), letti sempre per
-- tenant. Nomi nella forma standard di Prisma, così `migrate status` non vede
-- deriva rispetto allo schema.
CREATE INDEX "products_tenant_id_deleted_at_idx"
  ON "products"("tenant_id", "deleted_at");

CREATE INDEX "product_variants_tenant_id_lifecycle_status_idx"
  ON "product_variants"("tenant_id", "lifecycle_status");

CREATE INDEX "product_variants_tenant_id_deleted_at_idx"
  ON "product_variants"("tenant_id", "deleted_at");
