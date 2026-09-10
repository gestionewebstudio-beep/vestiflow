import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShopifyInventoryRepublishService } from '../../shopify/shopify-inventory-republish.service';
import { ShopifyController } from '../../shopify/shopify.controller';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * La coda del ritentativo, contro PostgreSQL vero.
 *
 * ⛔ **Perché non basta il doppio.** La rotazione dipende da `ORDER BY
 *    last_attempt_at ASC NULLS FIRST` e dalla scrittura che precede ogni
 *    tentativo: sono due comportamenti del **database**, e un doppio che li
 *    imita prova sé stesso. Qui l'ordinamento lo fa Postgres.
 *
 * ⭐ **Il difetto riprodotto**: con l'ordinamento per `updated_at`, le righe che
 *    escono senza scrivere (`base_assente`, `collegamento_escluso`,
 *    `rinvio_attivo`) restavano in testa **anche alle passate successive**. Con
 *    duecento davanti, la duecentunesima non veniva raggiunta mai — e alzare il
 *    tetto della scansione sposta il blocco, non lo toglie.
 */
describe('Coda di ripubblicazione — rotazione su database vero', () => {
  let prisma: PrismaClient;

  const BLOCCATE = 220;
  const DIETRO = 3;
  const TOTALE = BLOCCATE + DIETRO;

  /** Le righe di stato sync non hanno chiavi esterne nel database: bastano id sintetici. */
  const varianteDi = (i: number) =>
    `9c${String(i).padStart(6, '0')}-0000-4000-8000-00000000c${String(i).padStart(3, '0')}`;
  const indiceDi = (variantId: string) => Number(variantId.slice(2, 8));
  const bloccata = (variantId: string) => indiceDi(variantId) < BLOCCATE;

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
    // ⛔ **`createdAt` DISTINTI, e non è un dettaglio del banco di prova.**
    //    `@default(now())` in PostgreSQL è l'istante della TRANSAZIONE: una
    //    `createMany` dà a tutte le righe lo stesso `created_at` al microsecondo,
    //    e con il secondo criterio in pareggio a decidere l'ordine resterebbe la
    //    chiave primaria — un uuid, cioè un ordine arbitrario rispetto a quello
    //    di arrivo. Queste prove misurano che il lavoro DIETRO si raggiunge, e
    //    «dietro» deve voler dire qualcosa.
    //
    // ⭐ Ed è anche più fedele: in esercizio le righe entrano in coda in momenti
    //    diversi, non tutte nello stesso istante.
    const nascita = Date.now() - TOTALE * 1000;
    await prisma.shopifyInventorySyncState.createMany({
      data: Array.from({ length: TOTALE }, (_, i) => ({
        tenantId: IDS.tenantA,
        variantId: varianteDi(i),
        locationId: IDS.locA1,
        // Tutte in coda per lo stesso motivo: il disallineamento osservato.
        mismatchDetected: true,
        createdAt: new Date(nascita + i * 1000),
        // ⭐ `lastAttemptAt` NULL: mai esaminate. E' lo stato di partenza vero.
      })),
    });
  });

  /**
   * Il push doppiato: le prime `BLOCCATE` escono senza scrivere, le altre riescono.
   *
   * ⭐ **Su una riuscita spegne il marcatore**, come fa `confermaTentativo` nel
   *    push vero. ⛔ Un doppio che non lo spegnesse lascerebbe la riga in coda
   *    per sempre e la prova misurerebbe un database che non esiste — è il
   *    difetto che questo banco ha avuto alla prima stesura.
   */
  function pushDoppio() {
    const tentate: string[] = [];
    const rispondi = async (_tenant: string, variantId: string) => {
      tentate.push(variantId);
      if (bloccata(variantId)) {
        return { pushed: false as const, reason: 'base_assente' as const, publishableAvailable: 0 };
      }
      await prisma.shopifyInventorySyncState.updateMany({
        where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
        data: { mismatchDetected: false, localPushPending: false, lastPushedAvailable: 5 },
      });
      return { pushed: true as const, publishableAvailable: 5 };
    };
    return {
      tentate,
      doppio: {
        ripubblicaDisallineamento: vi.fn(rispondi),
        pushLevel: vi.fn(rispondi),
      },
    };
  }

  it('⭐ 220 bloccate davanti, 3 recuperabili dietro: il lavoro si raggiunge su più passate', async () => {
    const { tentate, doppio } = pushDoppio();

    let ripubblicate = 0;
    let passate = 0;
    const esaminatePerPassata: number[] = [];

    while (ripubblicate < DIETRO && passate < 12) {
      // ⭐ **Servizio RICOSTRUITO a ogni passata**: se la rotazione vivesse in
      //    memoria di processo, qui ricomincerebbe da capo e il ciclo non
      //    finirebbe. Vive nel database, ed è il punto della prova.
      const service = new ShopifyInventoryRepublishService(prisma as never, doppio as never);
      const esito = await service.retryPending(IDS.tenantA);
      esaminatePerPassata.push(esito.attempted);
      ripubblicate += esito.republished;
      passate += 1;
    }

    expect(ripubblicate).toBe(DIETRO);
    // ⛔ Prima del rimedio questo ciclo non sarebbe mai uscito: si ferma per il
    //    tetto delle passate, non perché il lavoro sia stato fatto.
    expect(passate).toBeGreaterThan(1);
    expect(passate).toBeLessThan(12);

    // Il LIMITE PER PASSATA resta: nessuna passata esamina più di 200 righe.
    for (const n of esaminatePerPassata) {
      expect(n).toBeLessThanOrEqual(200);
    }

    // Le tre righe dietro sono state davvero tentate.
    for (let i = BLOCCATE; i < TOTALE; i += 1) {
      expect(tentate).toContain(varianteDi(i));
    }

    // ⭐ E la coda si è svuotata solo di quelle: le bloccate restano.
    const rimaste = await prisma.shopifyInventorySyncState.count({
      where: { tenantId: IDS.tenantA, mismatchDetected: true },
    });
    expect(rimaste).toBe(BLOCCATE);
  });

  it('⭐ la marcatura è PERSISTENTE: ogni riga esaminata porta `lastAttemptAt`', async () => {
    const { doppio } = pushDoppio();
    const service = new ShopifyInventoryRepublishService(prisma as never, doppio as never);

    const esito = await service.retryPending(IDS.tenantA);

    const marcate = await prisma.shopifyInventorySyncState.count({
      where: { tenantId: IDS.tenantA, lastAttemptAt: { not: null } },
    });
    expect(marcate).toBe(esito.attempted);
    // ⛔ E le NON esaminate restano a NULL: sono quelle che la passata dopo
    //    prende per prime, ed è l'ordinamento a garantirlo.
    const maiViste = await prisma.shopifyInventorySyncState.count({
      where: { tenantId: IDS.tenantA, lastAttemptAt: null },
    });
    expect(maiViste).toBe(TOTALE - esito.attempted);
  });

  it('⭐ la seconda passata prende righe DIVERSE dalla prima', async () => {
    const primo = pushDoppio();
    await new ShopifyInventoryRepublishService(prisma as never, primo.doppio as never).retryPending(
      IDS.tenantA,
    );

    const secondo = pushDoppio();
    await new ShopifyInventoryRepublishService(
      prisma as never,
      secondo.doppio as never,
    ).retryPending(IDS.tenantA);

    const insiemePrimo = new Set(primo.tentate);
    const nuoveNelSecondo = secondo.tentate.filter((v) => !insiemePrimo.has(v));
    // ⛔ Con l'ordinamento per `updated_at` questo valeva ZERO: la seconda
    //    passata riprendeva esattamente le stesse righe della prima.
    expect(nuoveNelSecondo.length).toBeGreaterThan(0);
  });

  it('⭐ una scrittura ESTRANEA non fa saltare il turno: serve una colonna sua', async () => {
    // ⛔ **Perché `updatedAt` non basta, e la prova precedente non lo mostrava.**
    //    Marcando la riga si bumpa anche `updatedAt` (è `@updatedAt`), quindi
    //    con quell'ordinamento la coda ruota lo stesso: la prima falsificazione
    //    restava VERDE. La differenza vera è un'altra.
    //
    // ⭐ `updatedAt` si muove per QUALUNQUE scrittura — il webhook che aggiorna
    //    l'osservato, la riconciliazione, il push. Una riga che riceve traffico
    //    verrebbe risospinta in fondo a ogni evento e **non verrebbe ritentata
    //    mai**: una fame diversa, e più subdola, perché colpisce proprio le
    //    righe attive. `lastAttemptAt` si muove solo quando la coda la guarda.
    const TOCCATA = 205; // fuori dalle prime 200: non esaminata alla prima passata

    const primo = pushDoppio();
    await new ShopifyInventoryRepublishService(prisma as never, primo.doppio as never).retryPending(
      IDS.tenantA,
    );
    expect(primo.tentate).not.toContain(varianteDi(TOCCATA));

    // Una scrittura che NON è un tentativo: è ciò che fa il webhook.
    await prisma.shopifyInventorySyncState.updateMany({
      where: { tenantId: IDS.tenantA, variantId: varianteDi(TOCCATA), locationId: IDS.locA1 },
      data: { lastObservedShopifyAvailable: 7 },
    });

    const secondo = pushDoppio();
    await new ShopifyInventoryRepublishService(
      prisma as never,
      secondo.doppio as never,
    ).retryPending(IDS.tenantA);

    // ⛔ Ordinando per `updatedAt` questa riga sarebbe finita ULTIMA fra tutte —
    //    dietro anche a quelle già tentate — e la passata non l'avrebbe raggiunta.
    expect(secondo.tentate).toContain(varianteDi(TOCCATA));
  });

  it('⛔ il recupero autonomo NON avvia l’import delle giacenze', async () => {
    // ⚠️ Coda ridotta alle sole recuperabili: qui si misura il RECUPERO, non la
    //    rotazione — con 220 bloccate davanti una passata sola non ci arriva, e
    //    l'asserzione parlerebbe d'altro.
    await prisma.shopifyInventorySyncState.deleteMany({
      where: {
        tenantId: IDS.tenantA,
        variantId: { in: Array.from({ length: BLOCCATE }, (_, i) => varianteDi(i)) },
      },
    });

    const { doppio } = pushDoppio();
    const republish = new ShopifyInventoryRepublishService(prisma as never, doppio as never);
    const pullInventory = vi.fn(() => Promise.resolve({}));

    const controller = new ShopifyController(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      { pullInventory } as never,
      republish as never,
      // ⭐ allineamento disponibilità: non usato da questa prova
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );

    const esito = await controller.retryPendingInventory(IDS.tenantA);

    // ⛔ È il punto del blocco: l'import costa una lettura per sede × lotti da
    //    50 articoli, e il recupero non deve pagarla.
    expect(pullInventory).not.toHaveBeenCalled();
    expect(esito.retried).toBe(true);
    // I contatori arrivano interi e coerenti col database vero.
    expect(esito.pending).toBe(DIETRO);
    expect(esito.republished).toBe(DIETRO);
    expect(esito.attempted).toBe(DIETRO);
    // ⭐ Ricontato dal database, non dedotto per sottrazione.
    expect(esito.remaining).toBe(0);
  });

  it('⭐ fra righe MAI esaminate parte la più vecchia, non quella che capita', async () => {
    // ⛔ **`ORDER BY last_attempt_at ASC NULLS FIRST` da solo non ordina
    //    niente, quando le righe sono tutte a NULL.** SQL non promette un
    //    ordine fra chiavi uguali: quale parte prima lo decide il piano di
    //    esecuzione. Il difetto è uscito il 10/09/2026 come prova
    //    INTERMITTENTE — `V10` di `esiti-comandi-massivi`, verde da sola e
    //    rossa dentro la suite.
    //
    // ⭐ Qui l'ordine di INSERIMENTO è l'opposto di quello di `createdAt`: la
    //    riga scritta per prima è la più NUOVA. Senza il secondo criterio la
    //    coda restituisce l'ordine fisico e prende quella sbagliata.
    await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });

    const NUOVA = varianteDi(900);
    const VECCHIA = varianteDi(901);
    const adesso = new Date();
    // ⛔ **Gli `id` sono ESPLICITI e in ordine opposto a `createdAt`**, e senza
    //    questo la prova era INTERMITTENTE: con uuid generati a caso, togliendo
    //    `createdAt` dall'ordinamento la coda sarebbe caduta sull'`id` e avrebbe
    //    indovinato l'ordine giusto una volta su due. Falsificata e trovata
    //    verde il 10/09/2026 — una prova che passa per fortuna non prova niente.
    await prisma.shopifyInventorySyncState.create({
      data: {
        id: '7c000000-0000-4000-8000-00000000c001',
        tenantId: IDS.tenantA,
        variantId: NUOVA,
        locationId: IDS.locA1,
        mismatchDetected: true,
        createdAt: adesso,
      },
    });
    await prisma.shopifyInventorySyncState.create({
      data: {
        id: '7d000000-0000-4000-8000-00000000d002',
        tenantId: IDS.tenantA,
        variantId: VECCHIA,
        locationId: IDS.locA1,
        mismatchDetected: true,
        createdAt: new Date(adesso.getTime() - 3_600_000),
      },
    });

    const tentate: string[] = [];
    const doppio = {
      ripubblicaDisallineamento: async (_tenant: string, variantId: string) => {
        tentate.push(variantId);
        // Nessuna delle due esce dalla coda: interessa solo CHI viene prima.
        return { pushed: false as const, reason: 'base_assente' as const, publishableAvailable: 0 };
      },
      pushLevel: async (_tenant: string, variantId: string) => {
        tentate.push(variantId);
        return { pushed: false as const, reason: 'base_assente' as const, publishableAvailable: 0 };
      },
    };

    await new ShopifyInventoryRepublishService(prisma as never, doppio as never).retryPending(
      IDS.tenantA,
    );

    expect(tentate).toEqual([VECCHIA, NUOVA]);
  });

  it('⭐ e quando anche `createdAt` COINCIDE, l ordine resta deciso', async () => {
    // ⛔ **`createdAt` non è unico.** Due righe create nella stessa transazione
    //    — un import, un collegamento massivo, una migrazione — portano lo
    //    stesso istante: il pareggio che il secondo criterio doveva chiudere si
    //    ripresenta identico un gradino più sotto.
    //
    // ⭐ Qui le due righe hanno lo STESSO `createdAt` e `lastAttemptAt` a NULL:
    //    l'unica cosa che le distingue è la chiave primaria. E l'inserimento è
    //    fatto apposta nell'ordine opposto, così senza il criterio la coda
    //    restituisce l'ordine fisico e sbaglia.
    await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });

    const PRIMA = '7a000000-0000-4000-8000-00000000a001';
    const DOPO = '7b000000-0000-4000-8000-00000000b002';
    const istante = new Date();
    for (const [id, variante] of [
      [DOPO, varianteDi(903)],
      [PRIMA, varianteDi(902)],
    ] as const) {
      await prisma.shopifyInventorySyncState.create({
        data: {
          id,
          tenantId: IDS.tenantA,
          variantId: variante,
          locationId: IDS.locA1,
          mismatchDetected: true,
          createdAt: istante,
        },
      });
    }

    const tentate: string[] = [];
    const rispondi = async (_tenant: string, variantId: string) => {
      tentate.push(variantId);
      return { pushed: false as const, reason: 'base_assente' as const, publishableAvailable: 0 };
    };
    const doppio = { ripubblicaDisallineamento: rispondi, pushLevel: rispondi };

    await new ShopifyInventoryRepublishService(prisma as never, doppio as never).retryPending(
      IDS.tenantA,
    );

    // ⚠️ L'ordine non è «giusto» nel merito — un uuid non significa niente — ma
    //    è DECISO: due esecuzioni danno lo stesso risultato, ed è tutto ciò che
    //    serve perché una prova non arrossi a caso.
    expect(tentate).toEqual([varianteDi(902), varianteDi(903)]);
  });
});
