import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyInventoryDelta } from '../../inventory/inventory-level-delta.util';
import { applyCommittedDelta } from '../../order-reservations/committed-delta.util';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * SEPARAZIONE DELLE ORIGINI — `docs/DA-FARE.md` §31.
 *
 * ⛔ **Il difetto che chiude.** Guardando una variazione di `available` non si
 *    poteva dire da dove venisse: una vendita al banco va **trasmessa** a
 *    Shopify, l'acquisizione di un ordine online **no**, perché là è già
 *    avvenuta. Rimandarla indietro sottrae due volte la stessa vendita; non
 *    trasmettere la prima la perde.
 *
 * ⭐ **Il caso centrale**, ed è quello da cui è partito tutto: una vendita
 *    online non ancora acquisita più una vendita al banco — **entrambe
 *    conteggiate una volta sola**.
 *
 * ⚠️ **Che cosa questo blocco NON fa ancora**: i contatori si riempiono, ma
 *    nessuno li consuma. Il valore inviato è ancora `max(0, available)` con
 *    confronto sull'ultimo confermato, e lo scarico alla conferma non c'è.
 *    Sono il passo successivo, e finché manca `L` **cresce senza svuotarsi**.
 */
describe('Origini separate — L e C su database vero', () => {
  let prisma: PrismaClient;

  /** Creata nel `beforeEach`: `inventory_levels` ha la FK sulla variante. */
  let VARIANTE: string;

  /** Legge i due contatori della coppia. */
  async function contatori() {
    const r = await prisma.shopifyInventorySyncState.findFirst({
      where: { tenantId: IDS.tenantA, variantId: VARIANTE, locationId: IDS.locA1 },
      select: { localPendingDelta: true, channelAcquiredDelta: true },
    });
    return { L: r?.localPendingDelta ?? null, C: r?.channelAcquiredDelta ?? null };
  }

  async function disponibile() {
    const r = await prisma.inventoryLevel.findFirst({
      where: { tenantId: IDS.tenantA, variantId: VARIANTE, locationId: IDS.locA1 },
      select: { available: true, onHand: true, committed: true },
    });
    return r;
  }

  /** La riga di stato CON base: è la condizione perché i contatori si muovano. */
  async function conBase(L = 0, C = 0) {
    await prisma.shopifyInventorySyncState.create({
      data: {
        tenantId: IDS.tenantA,
        variantId: VARIANTE,
        locationId: IDS.locA1,
        lastPushedAvailable: 10,
        localPendingDelta: L,
        channelAcquiredDelta: C,
      },
    });
  }

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
  });

  afterAll(async () => {
    await prisma.shopifyInventorySyncState.deleteMany({});
    await svuota(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    await prisma.shopifyInventorySyncState.deleteMany({});
    await prisma.inventoryLevel.deleteMany({});
    const prodotto = await prisma.product.create({
      data: { tenantId: IDS.tenantA, name: 'Articolo origini TEST', articleCode: 'ORIG-TEST' },
    });
    const variante = await prisma.productVariant.create({
      data: {
        tenantId: IDS.tenantA,
        productId: prodotto.id,
        sku: 'ORIG-TEST',
        sellingPriceMinor: 100,
      },
    });
    VARIANTE = variante.id;
    await prisma.inventoryLevel.create({
      data: {
        tenantId: IDS.tenantA,
        variantId: VARIANTE,
        locationId: IDS.locA1,
        onHand: 10,
        available: 10,
        committed: 0,
      },
    });
  });

  it('⭐ IL CASO CENTRALE: vendita online non acquisita + vendita al banco, ciascuna UNA volta', async () => {
    await conBase();

    // 1. Su Shopify è già avvenuta una vendita online: là `available` è 9.
    //    Da noi non si è ancora saputo niente — nessuna scrittura locale.
    //    (Lo stato remoto non è modellato qui: conta che noi NON l'abbiamo.)

    // 2. Vendita al banco di 1: è LOCALE, va trasmessa.
    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, VARIANTE, IDS.locA1, -1, 'locale');
    });

    expect(await contatori()).toEqual({ L: -1, C: 0 });

    // 3. Poi arriva l'ordine online e viene acquisito: impegno +1, quindi
    //    disponibile −1. È di CANALE: Shopify l'ha già applicato.
    await prisma.$transaction(async (tx) => {
      await applyCommittedDelta(tx, IDS.tenantA, VARIANTE, IDS.locA1, 1, 'canale');
    });

    // ⭐ Ciascuna conteggiata UNA volta, e nella colonna giusta.
    expect(await contatori()).toEqual({ L: -1, C: -1 });

    // Il Disponibile locale le riflette entrambe: 10 − 1 − 1 = 8.
    const livello = await disponibile();
    expect(livello?.available).toBe(8);
    expect(livello?.committed).toBe(1);

    // ⛔ E il lavoro locale da trasmettere resta UNO SOLO: l'ordine online non
    //    è entrato in L, quindi non verrà rimandato a Shopify.
    expect((await contatori()).L).toBe(-1);
  });

  it("⭐ effetto già applicato da Shopify: acquisizione senza finire fra le cose da trasmettere", async () => {
    await conBase();

    await prisma.$transaction(async (tx) => {
      await applyCommittedDelta(tx, IDS.tenantA, VARIANTE, IDS.locA1, 2, 'canale');
    });

    expect(await contatori()).toEqual({ L: 0, C: -2 });
  });

  it('⭐ un ordine Shopify arrivato DURANTE un invio non cancella il lavoro locale', async () => {
    // Lavoro locale già pendente: una vendita al banco non ancora trasmessa.
    await conBase(-1, 0);

    // Mentre l'invio è in volo arriva e si acquisisce un ordine online.
    await prisma.$transaction(async (tx) => {
      await applyCommittedDelta(tx, IDS.tenantA, VARIANTE, IDS.locA1, 1, 'canale');
    });

    // ⛔ L non è stato toccato: il lavoro locale è ancora lì da trasmettere.
    expect(await contatori()).toEqual({ L: -1, C: -1 });
  });

  it('⭐ disponibilità NEGATIVE: il debito si conserva, non si pubblica merce inesistente', async () => {
    await conBase();

    // Oversell locale: si vende più di quanto c'è.
    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, VARIANTE, IDS.locA1, -13, 'locale');
    });

    const livello = await disponibile();
    expect(livello?.available).toBe(-3);
    // ⭐ Il contatore conserva il debito per intero: è il residuo che il clamp
    //    del pubblicabile non può trasmettere, e che non deve sparire.
    expect(await contatori()).toEqual({ L: -13, C: 0 });

    // Un carico INSUFFICIENTE a tornare positivi non cancella il debito.
    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, VARIANTE, IDS.locA1, 2, 'locale');
    });
    expect((await disponibile())?.available).toBe(-1);
    expect((await contatori()).L).toBe(-11);
  });

  it('⛔ riga SENZA base: i contatori restano NULL e non accumulano', async () => {
    await prisma.shopifyInventorySyncState.create({
      data: { tenantId: IDS.tenantA, variantId: VARIANTE, locationId: IDS.locA1 },
    });

    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, VARIANTE, IDS.locA1, -1, 'locale');
    });

    // ⭐ In SQL `NULL + n` resta NULL: la guardia è il tipo, non un controllo.
    //    La base la crea la partenza controllata, non il primo invio ordinario.
    expect(await contatori()).toEqual({ L: null, C: null });
    // La giacenza però si è mossa: le due cose sono indipendenti.
    expect((await disponibile())?.available).toBe(9);
  });

  it('⛔ coppia NON collegata al canale: nessuna riga di stato viene creata', async () => {
    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, VARIANTE, IDS.locA1, -1, 'locale');
    });

    const righe = await prisma.shopifyInventorySyncState.count({
      where: { tenantId: IDS.tenantA, variantId: VARIANTE },
    });
    expect(righe).toBe(0);
  });

  it('⛔ la registrazione è nella STESSA transazione: se questa fallisce, non resta niente', async () => {
    await conBase();

    await expect(
      prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, VARIANTE, IDS.locA1, -5, 'locale');
        throw new Error('guasto a metà');
      }),
    ).rejects.toThrow('guasto a metà');

    // ⭐ Né la giacenza né il contatore: o tutti e due, o nessuno dei due.
    expect((await disponibile())?.available).toBe(10);
    expect(await contatori()).toEqual({ L: 0, C: 0 });
  });
});
