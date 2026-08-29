-- Stati commerciali comuni dei due Ordini — Passo 6.
--
-- I quattro stati (Da confermare · Confermato · Concluso · Annullato) esistevano
-- come vocabolario in `api/src/common/order-state.util.ts`, ma non come dato:
--
--   Ordine CLIENTE     nessuna colonna di stato. Lo stato si DEDUCEVA da tre
--                      campi del canale — cancelled_at, fulfilled_at,
--                      fulfillment_status — e «Da confermare» non aveva dove
--                      esistere: nessuna loro combinazione lo distingue da
--                      «Confermato».
--   Ordine FORNITORE   colonna enum, ma con tre soli valori: manca to_confirm.
--
-- Norma: docs/18 §2.4-bis (modello e backfill), docs/17 §2.3 (additività),
--        docs/12 §0.4-bis (riapertura ed eleggibilità).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · ORDINE FORNITORE — additivo, nessun dato cambia
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ⭐ Si ESTENDE l'enum esistente invece di sostituire la colonna. La colonna
--    funziona e mappa già 1:1 sui tre stati; sostituirla vorrebbe dire
--    riscrivere ogni riga per ottenere simmetria, non correttezza.
--
-- ⚠️ `ADD VALUE` è ammesso dentro una transazione da PostgreSQL 12, ma il valore
--    nuovo NON può essere usato nella stessa transazione. Qui non lo si usa:
--    nessun ordine esistente diventa `to_confirm` (non c'è un dato che lo
--    dimostri), e il default di creazione resta `confirmed`.
ALTER TYPE "SupplierOrderStatus" ADD VALUE IF NOT EXISTS 'to_confirm';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · ORDINE CLIENTE — colonna nuova, ANNULLABILE e SENZA default
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE "OrderCommercialState" AS ENUM ('to_confirm', 'confirmed', 'concluded', 'cancelled');

-- ⛔ NIENTE `DEFAULT 'confirmed'`, ed è una decisione, non una dimenticanza.
--
--    NULL significa «questo ordine non ha un ciclo commerciale VestiFlow», ed è
--    il caso di ogni ordine di canale (Shopify, POS, banco). Un default di
--    colonna assegnerebbe uno stato nostro a un record di canale ogni volta che
--    una INSERT omettesse il campo — un import, una sync, uno script. La
--    garanzia «NULL per i canali» regge solo finché NULLA la riempie da sé.
--
--    Il valore alla creazione lo assegna il SERVIZIO, e solo per source=manual.
ALTER TABLE "sales_orders" ADD COLUMN "commercial_state" "OrderCommercialState";

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · BACKFILL — decide la RELAZIONE documentale, non l'etichetta legacy
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ⛔ `fulfilled_at` da solo NON è prova di «Concluso», ed è la lezione della
--    misura del 28/08/2026: eliminare il DDT conclusivo azzera `document_id`
--    (FK ON DELETE SET NULL) ma NON ripulisce `fulfilled_at`. Restano ordini
--    marcati evasi che non hanno più alcun collegamento: sono residui del
--    vecchio workflow, e vanno riportati a `confirmed`.
--
-- ⭐ Per la stessa ragione `partially_fulfilled` non ha bisogno di una regola
--    propria: con collegamento attivo è `concluded`, senza è `confirmed`.
--
-- L'ordine dei rami è significativo: annullato vince su tutto.

-- 3a · Annullati
UPDATE "sales_orders"
SET "commercial_state" = 'cancelled'
WHERE "source" = 'manual'
  AND "cancelled_at" IS NOT NULL;

-- 3b · Conclusi: esiste un collegamento documentale ATTIVO.
--
--      «Attivo» = il documento esiste e non è annullato. Il predicato è
--      `status <> 'cancelled'`, che è quello canonico in tutto il codice (20+
--      query) e lo stesso con cui `syncSupplierOrderConclusion` assegna
--      Concluso. `cancelled_at` sul documento è solo il timestamp compagno.
UPDATE "sales_orders" o
SET "commercial_state" = 'concluded'
WHERE o."source" = 'manual'
  AND o."commercial_state" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "documents" d
    WHERE d."id" = o."document_id"
      AND d."status" <> 'cancelled'
  );

-- 3c · Tutto il resto degli ordini MANUALI è Confermato.
--
--      ⛔ Nessun record storico diventa `to_confirm`: non esiste un dato che lo
--         dimostri. Quel valore nasce solo per ordini nuovi.
UPDATE "sales_orders"
SET "commercial_state" = 'confirmed'
WHERE "source" = 'manual'
  AND "commercial_state" IS NULL;

-- 3d · Gli ordini di CANALE restano NULL.
--
--      Non c'è nessuna istruzione qui, ed è deliberato: i campi del canale
--      (fulfillment_status, fulfilled_at, financial_status) non vanno
--      reinterpretati, e questa migration non li legge nemmeno.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · INDICE per l'eleggibilità
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Il filtro «includibili» diventa:
--   tenant_id = ? AND source = 'manual' AND commercial_state = 'confirmed'
--                 AND document_id IS NULL
--
-- Indice PARZIALE sul solo insieme interrogato: gli ordini di canale (la
-- maggioranza in un tenant con Shopify) non entrano nell'indice.
CREATE INDEX "sales_orders_includable_idx"
  ON "sales_orders" ("tenant_id", "commercial_state")
  WHERE "source" = 'manual' AND "document_id" IS NULL;
