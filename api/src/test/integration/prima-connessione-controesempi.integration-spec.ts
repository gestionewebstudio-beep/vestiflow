import { OnlineOrderEventType, SalesOrderSource, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyInventoryDelta } from '../../inventory/inventory-level-delta.util';
import { OnlineOrderLifecycleService } from '../../order-reservations/online-order-lifecycle.service';
import { OnlineSaleFulfillmentService } from '../../order-reservations/online-sale-fulfillment.service';
import { StockReservationService } from '../../order-reservations/stock-reservation.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * ⛔ I TRE CONTROESEMPI del proprietario (12/09/2026) al «confronto dei totali
 *    per coppia» proposto in `docs/27` §5-bis — che era il confronto
 *    `committed` remoto / impegni locali GIÀ RITIRATO in `DA-FARE` §31 (prova
 *    38): «sono insiemi di origini diverse, e i totali si compensano».
 *
 * Qui girano i servizi VERI — `OnlineOrderLifecycleService`,
 * `StockReservationService`, `OnlineSaleFulfillmentService`, `applyInventoryDelta`
 * — e lo stato di Shopify è rappresentato dai numeri che la sua risposta
 * porterebbe (`on_hand`, `committed`). L'uguaglianza dei totali è calcolata
 * NELLA PROVA, come farebbe il meccanismo: nessun meccanismo è entrato nel
 * codice. Ogni prova dimostra che i numeri uguali NON certificano quali
 * effetti siano già contabilizzati.
 */
describe('Prima connessione — i controesempi al confronto dei totali', () => {
  let prisma: PrismaClient;
  let variantId: string;

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
  });

  afterAll(async () => {
    await svuota(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    const prodotto = await prisma.product.create({
      data: { tenantId: IDS.tenantA, name: 'Articolo di partenza', articleCode: 'PC-1' },
    });
    const variante = await prisma.productVariant.create({
      data: {
        tenantId: IDS.tenantA,
        productId: prodotto.id,
        sku: 'PC-1',
        sellingPriceMinor: 100,
        shopifyVariantId: 'gid://shopify/ProductVariant/998040',
        shopifyInventoryItemId: '998050',
      },
    });
    variantId = variante.id;
    // Giacenza di partenza NULLA: la base la scrive la prova, come farebbe il
    // trasferimento (S→V) o come è già in VestiFlow (V→S).
    await prisma.inventoryLevel.create({
      data: {
        tenantId: IDS.tenantA,
        variantId,
        locationId: IDS.locA1,
        onHand: 0,
        available: 0,
        committed: 0,
      },
    });
  });

  // ── Attrezzi ────────────────────────────────────────────────────────────────

  function ciclo() {
    const impegni = new StockReservationService(prisma as never);
    return {
      impegni,
      lifecycle: new OnlineOrderLifecycleService(
        prisma as never,
        impegni,
        new OnlineSaleFulfillmentService(impegni),
      ),
    };
  }

  async function livello() {
    return prisma.inventoryLevel.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
      select: { onHand: true, committed: true, available: true },
    });
  }

  /** La BASE per coppia, come la scrive il trasferimento: giacenza = `on_hand` letto. */
  async function scriviBase(onHandRemoto: number) {
    const attuale = (await livello()).onHand;
    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(
        tx,
        IDS.tenantA,
        variantId,
        IDS.locA1,
        onHandRemoto - attuale,
        'canale',
      );
    });
  }

  async function creaOrdine(source: SalesOrderSource, numero: string, quantita: number) {
    const ordine = await prisma.salesOrder.create({
      data: {
        tenantId: IDS.tenantA,
        orderNumber: numero,
        customerName: source === SalesOrderSource.manual ? 'Cliente del banco' : 'Cliente online',
        placedAt: new Date(),
        source,
        locationId: IDS.locA1,
      },
    });
    const riga = await prisma.salesOrderLine.create({
      data: {
        orderId: ordine.id,
        lineNumber: 1,
        variantId,
        sku: 'PC-1',
        title: 'Riga',
        variantLabel: 'Unica',
        quantity: quantita,
        unitPriceMinor: 1000,
        totalMinor: 1000 * quantita,
      },
    });
    return { ordine, riga };
  }

  /** «Il confronto dei totali», calcolato qui e non nel codice. */
  function totaliUguali(
    shopify: { onHand: number; committed: number },
    vf: { onHand: number; committed: number },
  ) {
    return {
      onHand: shopify.onHand === vf.onHand,
      committed: shopify.committed === vf.committed,
    };
  }

  // ── 1 · Impegno da ordine LOCALE, che su Shopify non esiste ─────────────────

  it('1 · un impegno locale e un ordine online non acquisito si COMPENSANO: totali uguali, insiemi diversi', async () => {
    // Base S→V: Shopify on_hand 10, VestiFlow 10.
    await scriviBase(10);

    // In VestiFlow nasce un ordine LOCALE (banco/manuale) da 1: impegno in VF, e
    // Shopify non lo sa — non deve saperlo.
    const { impegni } = ciclo();
    const locale = await creaOrdine(SalesOrderSource.manual, 'VF-LOC-1', 1);
    await prisma.$transaction((tx) =>
      impegni.syncOrderReservationsTx(tx, {
        tenantId: IDS.tenantA,
        salesOrderId: locale.ordine.id,
        channel: SalesOrderSource.manual,
        locationId: IDS.locA1,
        lines: [{ salesOrderLineId: locale.riga.id, variantId, sku: 'PC-1', quantity: 1 }],
      }),
    );

    // Su Shopify intanto nasce un ordine ONLINE da 1, ancora aperto, che
    // VestiFlow NON ha acquisito: committed remoto 1.
    const shopify = { onHand: 10, committed: 1 };

    const vf = await livello();
    expect(vf).toEqual({ onHand: 10, committed: 1, available: 9 });

    // ⛔ I totali coincidono: passerebbe. Ma l'impegno di VF è di un ordine che
    //    Shopify non ha, e il committed di Shopify è di un ordine che VF non ha.
    expect(totaliUguali(shopify, vf)).toEqual({ onHand: true, committed: true });
    const impegniVf = await prisma.stockReservation.findMany({
      where: { tenantId: IDS.tenantA, variantId },
      select: { order: { select: { source: true, orderNumber: true } } },
    });
    expect(impegniVf.map((r) => r.order.source)).toEqual([SalesOrderSource.manual]);
    const ordiniOnlineInVf = await prisma.salesOrder.count({
      where: { tenantId: IDS.tenantA, source: SalesOrderSource.shopify_online },
    });
    expect(ordiniOnlineInVf).toBe(0);

    // E quando l'ordine online verrà evaso su Shopify (on_hand 9), VestiFlow lo
    // vedrà senza impegno → nessuno scarico: 10 contro 9, dopo una «verifica» passata.
  });

  // ── 2 · V→S: ordine online creato ed evaso PRIMA dell'acquisizione ──────────

  it('2 · V→S: evaso prima dell’acquisizione → committed 0 = impegni 0 PASSA, e la giacenza locale non è aggiornata', async () => {
    // V→S: la giacenza è di VestiFlow: 10 pezzi, fisicamente sullo scaffale.
    await scriviBase(10);

    // Su Shopify un ordine da 1 viene creato ED evaso prima che VestiFlow lo
    // acquisisca: la merce è partita. Shopify: on_hand 9, committed 0.
    const shopify = { onHand: 9, committed: 0 };

    // L'acquisizione arriva a cose fatte: l'ordine è già evaso, quindi senza
    // impegno → la Vendita online nasce SENZA effetti di magazzino (`not_applied`).
    const { lifecycle } = ciclo();
    const online = await creaOrdine(SalesOrderSource.shopify_online, 'SH-1', 1);
    const base = {
      tenantId: IDS.tenantA,
      channel: SalesOrderSource.shopify_online,
      salesOrderId: online.ordine.id,
      externalOrderId: 'EXT-SH-1',
    };
    await prisma.salesOrder.update({
      where: { id: online.ordine.id },
      data: { fulfillmentStatus: 'fulfilled' },
    });
    expect(
      await lifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_created,
        locationId: IDS.locA1,
        lines: [{ salesOrderLineId: online.riga.id, variantId, sku: 'PC-1', quantity: 1 }],
      }),
    ).toBe('applied');
    expect(
      await lifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_fulfilled,
        locationId: IDS.locA1,
      }),
    ).toBe('applied');

    const vf = await livello();
    // ⛔ VestiFlow dice ancora 10: la merce è partita e nessuno l'ha scaricata.
    expect(vf).toEqual({ onHand: 10, committed: 0, available: 10 });
    const vendita = await prisma.onlineSale.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, salesOrderId: online.ordine.id },
      select: { inventoryStatus: true },
    });
    expect(vendita.inventoryStatus).toBe('not_applied');

    // ⛔ La sola condizione V→S — committed uguale — PASSA: 0 = 0. Certifica una
    //    coppia in cui un effetto reale (un pezzo partito) non è contabilizzato.
    expect(totaliUguali(shopify, vf).committed).toBe(true);
    expect(totaliUguali(shopify, vf).onHand).toBe(false);
  });

  // ── 3 · Riprova che rifà la base, poi l'acquisizione tardiva dell'evasione ──

  it('3 · la base rifatta ASSORBE un’evasione; l’acquisizione tardiva la SCARICA di nuovo: contata due volte', async () => {
    // Base S→V a 10; l'ordine online da 1 è aperto e acquisito: impegno in VF.
    await scriviBase(10);
    const { lifecycle } = ciclo();
    const online = await creaOrdine(SalesOrderSource.shopify_online, 'SH-2', 1);
    const base = {
      tenantId: IDS.tenantA,
      channel: SalesOrderSource.shopify_online,
      salesOrderId: online.ordine.id,
      externalOrderId: 'EXT-SH-2',
    };
    await lifecycle.handle({
      ...base,
      type: OnlineOrderEventType.online_order_created,
      locationId: IDS.locA1,
      lines: [{ salesOrderLineId: online.riga.id, variantId, sku: 'PC-1', quantity: 1 }],
    });
    expect(await livello()).toEqual({ onHand: 10, committed: 1, available: 9 });

    // Shopify evade: on_hand 9, committed 0. La «verifica» non passa (10 ≠ 9) →
    // «Riprova» RIFÀ LA BASE a 9: VestiFlow assorbe il pezzo partito.
    await scriviBase(9);
    expect(await livello()).toEqual({ onHand: 9, committed: 1, available: 8 });

    // Ora arriva l'evasione, tardi (webhook o reimport): VestiFlow ha l'impegno
    // → consuma l'impegno E scarica. ⛔ Lo stesso pezzo, tolto due volte.
    expect(
      await lifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_fulfilled,
        locationId: IDS.locA1,
      }),
    ).toBe('applied');

    const vf = await livello();
    expect(vf).toEqual({ onHand: 8, committed: 0, available: 8 });
    const shopify = { onHand: 9, committed: 0 };
    expect(totaliUguali(shopify, vf).onHand).toBe(false);
    // E il movimento di scarico esiste, accanto ai due movimenti di base.
    const scarichi = await prisma.stockMovement.count({
      where: { tenantId: IDS.tenantA, variantId, type: 'online_sale' },
    });
    expect(scarichi).toBe(1);
  });
});
