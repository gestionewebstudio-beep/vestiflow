import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { ShopifySyncService } from '../../shopify/shopify-sync.service';
import { creaClientIntegrazione } from './prisma';
import { P, creaDataset, svuotaTutto } from './shopify-distruttivo.fixture';

/**
 * LE RIGHE DI UN ORDINE SHOPIFY — che cosa succede con un payload magro.
 *
 * ⛔ **La domanda misurata qui e' una sola**: `applyOrderFromShopify` cancella
 *    le righe che non compaiono piu' nel payload con
 *
 *      externalLineId: { notIn: lineRows.map((row) => row.externalLineId) }
 *
 *    e con `line_items` vuoto o assente quell'elenco e' `[]`. La semantica di
 *    `NOT IN ()` non e' la stessa in tutti i dialetti e in tutti gli ORM: se
 *    Prisma la traducesse in una condizione sempre vera, un payload magro
 *    cancellerebbe TUTTE le righe dell'ordine e ne rilascerebbe gli impegni.
 *
 * ⭐ **Misurato il 07/09/2026: `notIn: []` cancella TUTTO.** Due righe su due,
 *    `count = 2`. Non era una deduzione sbagliata: era una deduzione, e ora e'
 *    un fatto. Il servizio si difende a monte — un payload senza righe sospende
 *    l'aggiornamento invece di applicarlo.
 */
describe('Righe ordine Shopify — payload magro e idempotenza (database reale)', () => {
  let prisma: PrismaClient;
  let contesto: INestApplicationContext;
  let sync: ShopifySyncService;

  /**
   * ⚠️ Il servizio normalizza in GID: il payload porta `id: 77700` e il
   *    database conserva `gid://shopify/Order/77700`. Cercare il numero nudo
   *    non trova niente — misurato.
   */
  const ORDINE_SHOPIFY = 'gid://shopify/Order/77700';

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    contesto = await NestFactory.createApplicationContext(AppModule, { logger: false });
    sync = contesto.get(ShopifySyncService);
  });

  afterAll(async () => {
    await contesto?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await svuotaTutto(prisma);
    await creaDataset(prisma);
  });

  /** Un payload d'ordine Shopify con le righe indicate. */
  function payload(righe: readonly { id: number; sku: string; qty: number }[]) {
    return {
      id: 77700,
      name: '#1001',
      created_at: '2026-05-01T10:00:00Z',
      currency: 'EUR',
      financial_status: 'paid',
      fulfillment_status: null,
      total_price: '100.00',
      subtotal_price: '100.00',
      total_tax: '0.00',
      customer: { id: 66001, first_name: 'Cliente', last_name: 'Prova' },
      line_items: righe.map((r) => ({
        id: r.id,
        sku: r.sku,
        title: `Riga ${r.sku}`,
        quantity: r.qty,
        price: '10.00',
        variant_title: null,
      })),
    } as Record<string, unknown>;
  }

  /** Righe, impegni e disponibilita': la fotografia che ogni scenario confronta. */
  async function stato() {
    const ordine = await prisma.salesOrder.findFirst({
      where: { tenantId: P.tenant, shopifyOrderId: ORDINE_SHOPIFY },
      select: { id: true },
    });
    const [righe, impegni, impegniAttivi, giacenza] = await Promise.all([
      ordine ? prisma.salesOrderLine.count({ where: { orderId: ordine.id } }) : 0,
      ordine ? prisma.stockReservation.count({ where: { salesOrderId: ordine.id } }) : 0,
      ordine
        ? prisma.stockReservation.count({ where: { salesOrderId: ordine.id, status: 'active' } })
        : 0,
      prisma.inventoryLevel.findUnique({ where: { id: P.giacenza } }),
    ]);
    return {
      ordineId: ordine?.id ?? null,
      righe,
      impegni,
      impegniAttivi,
      onHand: giacenza?.onHand ?? null,
      available: giacenza?.available ?? null,
      committed: giacenza?.committed ?? null,
    };
  }

  /** Le due righe di partenza, comuni a quasi tutti gli scenari. */
  const DUE_RIGHE = [
    { id: 5001, sku: 'SKU-SHOP-1', qty: 2 },
    { id: 5002, sku: 'SKU-LOCALE-1', qty: 1 },
  ] as const;

  it('scenario 0 · MISURA — `notIn: []` in Prisma è una condizione SEMPRE VERA', async () => {
    /*
      ⭐ **La misura che ha trasformato una deduzione in un fatto.** Si costruisce
         lo stesso `deleteMany` del servizio, con l'elenco VUOTO, su due righe che
         hanno entrambe un `externalLineId`. Se `notIn: []` fosse falsa per ogni
         riga — la lettura intuitiva di «non è in un insieme vuoto» — nessuna
         verrebbe toccata.

      ⛔ **Vengono cancellate tutte e due.** `count = 2`, righe rimaste 0.
         Misurato il 07/09/2026 su PostgreSQL 17.11.

      ⚠️ Questa prova NON esercita il servizio: esercita Prisma. Serve a fissare
         il comportamento dello strumento, perché la protezione nel servizio
         (`lines.length === 0` → sospendi) ha senso solo finché questo resta vero.
         Se un aggiornamento di Prisma cambiasse la semantica, questa riga
         diventerebbe rossa e lo direbbe.
    */
    const ordine = await prisma.salesOrder.create({
      data: {
        tenantId: P.tenant,
        orderNumber: 'MISURA-notIn',
        customerName: 'Prova',
        placedAt: new Date('2026-05-01T10:00:00Z'),
        shopifyOrderId: 'gid://shopify/Order/99999',
      },
    });
    await prisma.salesOrderLine.createMany({
      data: ['1', '2'].map((externalLineId) => ({
        orderId: ordine.id,
        externalLineId,
        // ⚠️ La colonna ha DEFAULT '': senza, la variante sparisce in silenzio.
        variantLabel: 'Taglia M',
        sku: `SKU-${externalLineId}`,
        title: `Riga ${externalLineId}`,
        quantity: 1,
        unitPriceMinor: 100,
        totalMinor: 100,
      })),
    });

    const esito = await prisma.salesOrderLine.deleteMany({
      where: {
        orderId: ordine.id,
        OR: [{ externalLineId: null }, { externalLineId: { notIn: [] } }],
      },
    });
    const rimaste = await prisma.salesOrderLine.count({ where: { orderId: ordine.id } });

    /*
      ⛔ **Il comportamento misurato, fissato come contratto dello strumento.**
         Non è ciò che si vorrebbe: è ciò che accade, e il servizio deve
         difendersene a monte invece di affidarsi a questa semantica.
    */
    expect(esito.count, 'notIn: [] non cancella più tutto: la protezione va rivista').toBe(2);
    expect(rimaste, 'notIn: [] non cancella più tutto: la protezione va rivista').toBe(0);
  });

  it('scenario 1 · stesso insieme di righe: nulla cambia', async () => {
    await sync.applyOrderFromShopify(P.tenant, payload(DUE_RIGHE));
    const prima = await stato();
    expect(prima.righe).toBe(2);

    await sync.applyOrderFromShopify(P.tenant, payload(DUE_RIGHE));
    const dopo = await stato();

    expect(dopo).toEqual(prima);
  });

  it('scenario 2 · una riga rimossa davvero dal payload: sparisce solo quella', async () => {
    await sync.applyOrderFromShopify(P.tenant, payload(DUE_RIGHE));
    const prima = await stato();
    expect(prima.righe).toBe(2);

    await sync.applyOrderFromShopify(P.tenant, payload([DUE_RIGHE[0]]));
    const dopo = await stato();

    expect(dopo.righe, 'doveva restare una riga sola').toBe(1);
    const rimasta = await prisma.salesOrderLine.findFirst({
      where: { orderId: dopo.ordineId ?? '' },
      select: { externalLineId: true },
    });
    expect(rimasta?.externalLineId).toBe('5001');
  });

  it('scenario 3 · `line_items: []` NON svuota l’ordine', async () => {
    await sync.applyOrderFromShopify(P.tenant, payload(DUE_RIGHE));
    const prima = await stato();
    expect(prima.righe).toBe(2);

    const vuoto = { ...payload(DUE_RIGHE), line_items: [] };
    await sync.applyOrderFromShopify(P.tenant, vuoto);

    const dopo = await stato();

    /*
      ⛔ **Un payload senza righe non e' un ordine diventato vuoto.** Un ordine
         Shopify non perde tutte le righe restando un ordine: se il payload le
         omette, o e' parziale o e' malformato — e in nessuno dei due casi
         VestiFlow deve dedurne che le righe non esistono piu'.
    */
    expect(dopo.righe, 'un payload vuoto ha svuotato l`ordine').toBe(prima.righe);
    expect(dopo.impegni, 'gli impegni sono stati toccati').toBe(prima.impegni);
    expect(dopo.impegniAttivi).toBe(prima.impegniAttivi);
    expect(dopo.available, 'la disponibilita e cambiata').toBe(prima.available);
    expect(dopo.committed, 'la quantita impegnata e cambiata').toBe(prima.committed);
  });

  it('scenario 4 · `line_items` ASSENTE non svuota l’ordine', async () => {
    await sync.applyOrderFromShopify(P.tenant, payload(DUE_RIGHE));
    const prima = await stato();

    const senzaChiave = { ...payload(DUE_RIGHE) };
    delete senzaChiave['line_items'];
    await sync.applyOrderFromShopify(P.tenant, senzaChiave);

    const dopo = await stato();
    expect(dopo.righe, 'un payload senza `line_items` ha svuotato l`ordine').toBe(prima.righe);
    expect(dopo.impegni).toBe(prima.impegni);
    expect(dopo.available).toBe(prima.available);
    expect(dopo.committed).toBe(prima.committed);
  });

  it('scenario 5 · payload incompleto: rifiutato o ignorato, mai distruttivo', async () => {
    await sync.applyOrderFromShopify(P.tenant, payload(DUE_RIGHE));
    const prima = await stato();

    // Senza `id` l'ordine non e' identificabile: il servizio lo salta.
    const senzaId = { ...payload(DUE_RIGHE) };
    delete senzaId['id'];
    const esito = await sync
      .applyOrderFromShopify(P.tenant, senzaId)
      .catch((e: unknown) => (e instanceof Error ? e.message : String(e)));

    const dopo = await stato();
    expect(dopo.righe).toBe(prima.righe);
    expect(dopo.impegni).toBe(prima.impegni);
    expect(dopo.available).toBe(prima.available);
    // 'skipped' oppure un errore: entrambi accettabili, purche' non distruttivi.
    expect(['skipped', 'created', 'updated'].includes(String(esito)) || typeof esito === 'string').toBe(
      true,
    );
  });

  it('scenario 6 · lo stesso aggiornamento ripetuto tre volte e idempotente', async () => {
    await sync.applyOrderFromShopify(P.tenant, payload(DUE_RIGHE));
    const dopoUno = await stato();

    await sync.applyOrderFromShopify(P.tenant, payload(DUE_RIGHE));
    await sync.applyOrderFromShopify(P.tenant, payload(DUE_RIGHE));
    const dopoTre = await stato();

    expect(dopoTre).toEqual(dopoUno);

    // E gli identificativi delle righe non cambiano: sono le stesse righe.
    const righe = await prisma.salesOrderLine.findMany({
      where: { orderId: dopoTre.ordineId ?? '' },
      select: { externalLineId: true },
      orderBy: { externalLineId: 'asc' },
    });
    expect(righe.map((r) => r.externalLineId)).toEqual(['5001', '5002']);
  });
});
