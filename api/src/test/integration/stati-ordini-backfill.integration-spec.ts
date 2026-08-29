import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaClientIntegrazione } from './prisma';
import { ATTESO, ATTESO_FORNITORE, creaLegacy, LEGACY, salvaSnapshot } from './stati-ordini-legacy.fixture';

/**
 * Collaudo della migration `20260828210000_stati_commerciali_ordini`.
 *
 * ⭐ **Due fasi attorno alla migration, e lo stesso file in entrambe:**
 *
 * ```text
 *   1. vitest … stati-ordini-backfill   ← crea le fixture, SALVA LO SNAPSHOT,
 *                                          e fallisce dicendo cosa manca
 *   2. npm run prisma:deploy:test       ← applica
 *   3. vitest … stati-ordini-backfill   ← confronta prima/dopo, riga per riga
 * ```
 *
 * ⛔ **In fase 2 le fixture NON si ricreano, ed è la correzione di un difetto
 *    che avrebbe reso il collaudo inutile.** La prima stesura chiamava
 *    `creaLegacy()` in ogni caso: dopo la migration avrebbe troncato e
 *    reinserito righe nuove, che nascono con `commercial_state` NULL perché gli
 *    `UPDATE` di backfill sono già stati eseguiti e non rigirano. Si sarebbero
 *    verificate righe che la migration non ha mai visto.
 *
 * ⭐ **Lo snapshot vive nel database, non in un file.** `_collaudo_snapshot` è
 *    una tabella creata in fase 1 che la migration non tocca: sopravvive fra le
 *    due esecuzioni, sta dove stanno i dati, e non lascia artefatti nel
 *    repository.
 *
 * Tutto in SQL grezzo: la colonna nuova non è nel client Prisma finché non si
 * tocca `schema.prisma`, e il collaudo del DATO non deve dipendere da quel passo.
 */
describe('migration stati commerciali — backfill su PostgreSQL TEST', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();

    // ⛔ Si rileva PRIMA di decidere se seminare: è l'ordine che rende valido
    //    il confronto prima/dopo.
    const colonne = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.columns
       WHERE table_name = 'sales_orders' AND column_name = 'commercial_state'`,
    );
    const migrata = Number(colonne[0]?.n ?? 0) > 0;

    if (!migrata) {
      await creaLegacy(prisma);
      await salvaSnapshot(prisma);
      // ⛔ Fallire nel hook, non lasciar passare le prove con un `return`:
      //    dieci prove verdi che non hanno verificato niente sono l'anti-pattern
      //    del test saltato che passa. Così ognuna è riportata come NON eseguita.
      throw new Error(
        [
          'Fase 1 completata: fixture legacy create e snapshot salvato.',
          '  Ora applica la migration:  npm run prisma:deploy:test',
          '  Poi riesegui questo file per verificare il backfill.',
        ].join('\n'),
      );
    }

    const snapshot = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.tables
       WHERE table_name = '_collaudo_snapshot'`,
    );
    if (Number(snapshot[0]?.n ?? 0) === 0) {
      throw new Error(
        'Lo snapshot pre-migration non esiste: il confronto prima/dopo non è ' +
          'possibile. Azzera il TEST (npm run db:test:reset) e ricomincia dalla fase 1.',
      );
    }
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  }, 60_000);

  it('le fixture legacy sono quelle su cui la migration ha girato', async () => {
    const righe = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM sales_orders WHERE tenant_id = '${LEGACY.tenant}'`,
    );
    expect(Number(righe[0]!.n)).toBe(Object.keys(ATTESO).length);
  });

  describe('il backfill, riga per riga', () => {
    it('ogni ordine cliente ha ESATTAMENTE lo stato atteso', async () => {
      const righe = await prisma.$queryRawUnsafe<{ id: string; s: string | null }[]>(
        `SELECT id, commercial_state::text AS s FROM sales_orders
         WHERE tenant_id = '${LEGACY.tenant}' ORDER BY id`,
      );
      expect(Object.fromEntries(righe.map((r) => [r.id, r.s]))).toEqual(ATTESO);
    });

    /**
     * ⭐ Il caso che la misura del 28/08 ha reso necessario: `fulfilled_at`
     * valorizzato ma nessun collegamento. Non è Concluso — è un residuo del
     * vecchio workflow (`delete` azzera la FK e non ripulisce il timestamp).
     */
    it('⭐ fulfilledAt senza collegamento → confirmed, non concluded', async () => {
      const r = await prisma.$queryRawUnsafe<{ s: string; f: Date | null; d: string | null }[]>(
        `SELECT commercial_state::text AS s, fulfilled_at AS f, document_id AS d
         FROM sales_orders WHERE id = '${LEGACY.ordResiduo}'`,
      );
      expect(r[0]!.f).not.toBeNull();
      expect(r[0]!.d).toBeNull();
      expect(r[0]!.s).toBe('confirmed');
    });

    it('⚠️ collegamento a documento ANNULLATO → confirmed', async () => {
      const r = await prisma.$queryRawUnsafe<{ s: string }[]>(
        `SELECT commercial_state::text AS s FROM sales_orders WHERE id = '${LEGACY.ordLinkAnnullato}'`,
      );
      expect(r[0]!.s).toBe('confirmed');
    });

    it('⛔ nessun ordine storico è diventato to_confirm', async () => {
      const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM sales_orders WHERE commercial_state = 'to_confirm'`,
      );
      expect(Number(r[0]!.n)).toBe(0);
    });
  });

  describe('⛔ gli ordini di canale: confronto PRIMA/DOPO', () => {
    it('commercial_state resta NULL su ogni source ≠ manual', async () => {
      const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM sales_orders
         WHERE source <> 'manual' AND commercial_state IS NOT NULL`,
      );
      expect(Number(r[0]!.n)).toBe(0);
    });

    /**
     * ⚠️ I due `::text` non sono decorazione: lo snapshot conserva gli enum come
     * TEXT, e in PostgreSQL `enum IS DISTINCT FROM text` non è un operatore —
     * la query FALLISCE invece di rispondere. La prima stesura lo faceva, e il
     * test risultava rosso per un errore di tipo, non per una differenza di dato.
     *
     * ⭐ Non si ri-derivano le attese: si confronta col DATO salvato prima della
     * migration. È l'unica forma che dimostra «identici», invece di dimostrare
     * «uguali a ciò che mi aspettavo».
     */
    it('⭐ fulfilledAt · fulfillmentStatus · financialStatus sono IDENTICI', async () => {
      const diff = await prisma.$queryRawUnsafe<{ id: string; campo: string }[]>(
        `SELECT o.id, 'fulfilled_at' AS campo FROM sales_orders o
           JOIN _collaudo_snapshot s ON s.id = o.id
          WHERE o.source <> 'manual' AND o.fulfilled_at IS DISTINCT FROM s.fulfilled_at
         UNION ALL
         SELECT o.id, 'fulfillment_status' FROM sales_orders o
           JOIN _collaudo_snapshot s ON s.id = o.id
          WHERE o.source <> 'manual' AND o.fulfillment_status::text IS DISTINCT FROM s.fulfillment_status
         UNION ALL
         SELECT o.id, 'financial_status' FROM sales_orders o
           JOIN _collaudo_snapshot s ON s.id = o.id
          WHERE o.source <> 'manual' AND o.financial_status::text IS DISTINCT FROM s.financial_status`,
      );
      expect(diff).toEqual([]);
    });

    it('e nemmeno un campo di canale è cambiato sugli ordini MANUALI', async () => {
      const diff = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT o.id FROM sales_orders o JOIN _collaudo_snapshot s ON s.id = o.id
          WHERE o.fulfilled_at IS DISTINCT FROM s.fulfilled_at
             OR o.fulfillment_status::text IS DISTINCT FROM s.fulfillment_status
             OR o.financial_status::text IS DISTINCT FROM s.financial_status
             OR o.cancelled_at IS DISTINCT FROM s.cancelled_at
             OR o.document_id IS DISTINCT FROM s.document_id`,
      );
      expect(diff).toEqual([]);
    });
  });

  describe('ordine fornitore: additivo, nessun dato cambia', () => {
    it('i tre stati esistenti sono invariati', async () => {
      const righe = await prisma.$queryRawUnsafe<{ id: string; s: string }[]>(
        `SELECT id, status::text AS s FROM supplier_orders
         WHERE tenant_id = '${LEGACY.tenant}' ORDER BY id`,
      );
      expect(Object.fromEntries(righe.map((r) => [r.id, r.s]))).toEqual(ATTESO_FORNITORE);
    });

    it('⭐ e sono identici allo snapshot pre-migration', async () => {
      const diff = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT o.id FROM supplier_orders o
           JOIN _collaudo_snapshot_fornitore s ON s.id = o.id
          WHERE o.status::text IS DISTINCT FROM s.status`,
      );
      expect(diff).toEqual([]);
    });

    it("⭐ to_confirm è ora un valore ammesso dall'enum", async () => {
      const r = await prisma.$queryRawUnsafe<{ v: string }[]>(
        `SELECT string_agg(enumlabel, ' ' ORDER BY enumsortorder) AS v
         FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'SupplierOrderStatus'`,
      );
      expect(r[0]!.v).toContain('to_confirm');
    });

    it('⛔ nessun ordine fornitore è diventato to_confirm', async () => {
      const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM supplier_orders WHERE status = 'to_confirm'`,
      );
      expect(Number(r[0]!.n)).toBe(0);
    });
  });

  describe('⛔ zero effetti quantitativi', () => {
    it('conteggi identici allo snapshot: reservation, movimenti, giacenze', async () => {
      const r = await prisma.$queryRawUnsafe<
        { tabella: string; prima: bigint; dopo: bigint }[]
      >(
        `SELECT c.tabella, c.n AS prima,
                CASE c.tabella
                  WHEN 'stock_reservations' THEN (SELECT count(*) FROM stock_reservations)
                  WHEN 'stock_movements'    THEN (SELECT count(*) FROM stock_movements)
                  WHEN 'inventory_levels'   THEN (SELECT count(*) FROM inventory_levels)
                END AS dopo
           FROM _collaudo_conteggi c`,
      );
      for (const riga of r) {
        expect(Number(riga.dopo), `${riga.tabella}: ${riga.prima} → ${riga.dopo}`).toBe(
          Number(riga.prima),
        );
      }
      expect(r.length).toBe(3);
    });

    it('nessuna somma di Giacenza/Impegnata è cambiata', async () => {
      const r = await prisma.$queryRawUnsafe<{ diff: bigint }[]>(
        `SELECT count(*) AS diff FROM _collaudo_giacenze g
           FULL OUTER JOIN (
             SELECT coalesce(sum(on_hand),0) AS on_hand, coalesce(sum(committed),0) AS committed
             FROM inventory_levels
           ) a ON true
          WHERE g.on_hand IS DISTINCT FROM a.on_hand OR g.committed IS DISTINCT FROM a.committed`,
      );
      expect(Number(r[0]!.diff)).toBe(0);
    });
  });

  describe('la forma della colonna e degli enum', () => {
    it('⛔ commercial_state è NULLABLE e SENZA default', async () => {
      const r = await prisma.$queryRawUnsafe<
        { is_nullable: string; column_default: string | null; udt_name: string }[]
      >(
        `SELECT is_nullable, column_default, udt_name FROM information_schema.columns
         WHERE table_name = 'sales_orders' AND column_name = 'commercial_state'`,
      );
      expect(r[0]!.is_nullable).toBe('YES');
      // Un DEFAULT assegnerebbe uno stato VestiFlow a un record di canale ogni
      // volta che una INSERT omettesse il campo.
      expect(r[0]!.column_default).toBeNull();
      expect(r[0]!.udt_name).toBe('OrderCommercialState');
    });

    it('OrderCommercialState contiene esattamente i quattro valori', async () => {
      const r = await prisma.$queryRawUnsafe<{ v: string }[]>(
        `SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) AS v
         FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'OrderCommercialState'`,
      );
      expect(r[0]!.v).toBe('to_confirm,confirmed,concluded,cancelled');
    });
  });

  describe("l'indice parziale per l'eleggibilità", () => {
    it('esiste', async () => {
      const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM pg_indexes
         WHERE tablename = 'sales_orders' AND indexname = 'sales_orders_includable_idx'`,
      );
      expect(Number(r[0]!.n)).toBe(1);
    });

    /**
     * ⚠️ **Che l'indice esista non dimostra che serva.** Su otto righe il
     * pianificatore sceglie comunque la scansione sequenziale: qui si verifica
     * solo che il predicato dell'indice **implichi** quello della query, cioè
     * che l'indice sia APPLICABILE. La misura di utilizzo reale va fatta su un
     * volume vero, e sta nel referto.
     */
    it('il suo predicato copre la query finale', async () => {
      const r = await prisma.$queryRawUnsafe<{ d: string }[]>(
        `SELECT indexdef AS d FROM pg_indexes
         WHERE indexname = 'sales_orders_includable_idx'`,
      );
      const def = r[0]!.d;
      expect(def).toContain('tenant_id');
      expect(def).toContain('commercial_state');
      expect(def).toContain("source = 'manual'");
      expect(def).toContain('document_id IS NULL');
    });
  });
});
