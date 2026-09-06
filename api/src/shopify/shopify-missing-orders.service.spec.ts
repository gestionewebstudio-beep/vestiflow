import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StockReservationService } from '../order-reservations/stock-reservation.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyInventoryPushService } from './shopify-inventory-push.service';
import { ShopifyMissingOrdersService } from './shopify-missing-orders.service';

const tenantId = 'tenant-1';
const NOW = new Date('2026-08-08T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** Ordine locale di canale, non evaso e non ancora segnalato. */
function localOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'so-1',
    orderNumber: '#1001',
    shopifyOrderId: 'gid://shopify/Order/1001',
    fulfilledAt: null,
    ...overrides,
  };
}

interface SetupOptions {
  /** Ordini locali dentro la finestra e non ancora segnalati. */
  readonly candidates?: readonly Record<string, unknown>[];
  /** Ordini locali già segnalati (per la prova del ritorno). */
  readonly flagged?: readonly Record<string, unknown>[];
  /** Impegni attivi trovati sull'ordine. */
  readonly reservations?: readonly Record<string, unknown>[];
}

function setup(options: SetupOptions = {}) {
  const tx = {
    stockReservation: {
      findMany: vi.fn().mockResolvedValue([...(options.reservations ?? [])]),
    },
    salesOrder: { update: vi.fn().mockResolvedValue({}) },
  };

  const prisma = {
    salesOrder: {
      // Le due letture si distinguono dal filtro, non dall'ordine di chiamata:
      // legare un mock alla sequenza lo rende fragile a ogni riordino.
      findMany: vi.fn((args: { where: Record<string, unknown> }) =>
        Promise.resolve(
          args.where['channelMissingSince'] === null
            ? [...(options.candidates ?? [])]
            : [...(options.flagged ?? [])],
        ),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  const reservations = { releaseOrderReservationsTx: vi.fn().mockResolvedValue(undefined) };
  const inventoryPush = { pushLevel: vi.fn().mockResolvedValue(undefined) };

  const service = new ShopifyMissingOrdersService(
    prisma as unknown as PrismaService,
    reservations as unknown as StockReservationService,
    inventoryPush as unknown as ShopifyInventoryPushService,
  );

  return { service, prisma, tx, reservations, inventoryPush };
}

/** L'ordine c'è ancora su Shopify. */
const PRESENTE = new Set(['gid://shopify/Order/1001']);
/** Shopify ha restituito altri ordini, ma non il nostro. */
const ASSENTE = new Set(['gid://shopify/Order/9999']);

describe('ShopifyMissingOrdersService', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── La guardia che conta più di tutte ─────────────────────────────────────
  //
  // Da un elenco remoto vuoto non si distingue «negozio senza ordini» da «la
  // chiamata non ha portato nulla». Nel secondo caso segnare tutti gli ordini
  // come spariti — e liberarne gli impegni — sarebbe il danno peggiore che
  // questa funzione possa fare.
  it('con elenco remoto vuoto non conclude niente', async () => {
    const { service, prisma, reservations } = setup({ candidates: [localOrder()] });

    const result = await service.reconcile(tenantId, {
      remoteOrderGids: new Set<string>(),
      now: NOW,
    });

    expect(result).toMatchObject({ missing: 0, reappeared: 0, released: 0 });
    expect(prisma.salesOrder.findMany).not.toHaveBeenCalled();
    expect(reservations.releaseOrderReservationsTx).not.toHaveBeenCalled();
  });

  // Il controllo inverso: senza, il test qui sopra passerebbe anche se il
  // servizio non segnalasse mai niente.
  it('con elenco remoto non vuoto lo stesso ordine viene segnalato', async () => {
    const { service, tx } = setup({ candidates: [localOrder()] });

    const result = await service.reconcile(tenantId, { remoteOrderGids: ASSENTE, now: NOW });

    expect(result.missing).toBe(1);
    expect(tx.salesOrder.update).toHaveBeenCalledWith({
      where: { id: 'so-1' },
      data: { channelMissingSince: NOW },
    });
  });

  it('un ordine ancora presente sul canale non viene toccato', async () => {
    const { service, tx } = setup({ candidates: [localOrder()] });

    const result = await service.reconcile(tenantId, { remoteOrderGids: PRESENTE, now: NOW });

    expect(result.missing).toBe(0);
    expect(tx.salesOrder.update).not.toHaveBeenCalled();
  });

  // ── La finestra ───────────────────────────────────────────────────────────
  //
  // Fuori dai 60 giorni Shopify non manda gli ordini, quindi l'assenza è il
  // limite dell'API e non un'informazione. Il margine tiene fuori anche il
  // bordo, che i due sistemi calcolano su orologi diversi.
  it('cerca solo dentro la finestra, e più stretta dei 60 giorni dichiarati', async () => {
    const { service, prisma } = setup();

    await service.reconcile(tenantId, { remoteOrderGids: ASSENTE, now: NOW });

    const candidatesCall = prisma.salesOrder.findMany.mock.calls.find(
      (call) =>
        (call[0] as { where: Record<string, unknown> }).where['channelMissingSince'] === null,
    );
    const where = (candidatesCall?.[0] as { where: { placedAt: { gte: Date } } }).where;
    const daysBack = (NOW.getTime() - where.placedAt.gte.getTime()) / DAY_MS;

    expect(daysBack).toBe(58);
  });

  // ── Gli impegni ───────────────────────────────────────────────────────────
  it('ordine non evaso: gli impegni si liberano subito', async () => {
    const { service, reservations, inventoryPush } = setup({
      candidates: [localOrder({ fulfilledAt: null })],
      reservations: [{ variantId: 'var-1', locationId: 'loc-1' }],
    });

    const result = await service.reconcile(tenantId, { remoteOrderGids: ASSENTE, now: NOW });

    expect(result.released).toBe(1);
    expect(reservations.releaseOrderReservationsTx).toHaveBeenCalledOnce();
    // Il calo di Impegnata va comunicato al canale, come in ogni altro flusso.
    expect(inventoryPush.pushLevel).toHaveBeenCalledWith(tenantId, 'var-1', 'loc-1');
  });

  // Il controllo inverso, e la regola di dominio: la merce di un ordine evaso è
  // uscita davvero, e cancellare l'ordine sul canale non la riporta indietro.
  it('ordine già evaso: nessun rilascio, solo la segnalazione', async () => {
    const { service, reservations, tx } = setup({
      candidates: [localOrder({ fulfilledAt: new Date('2026-08-01T10:00:00.000Z') })],
      reservations: [{ variantId: 'var-1', locationId: 'loc-1' }],
    });

    const result = await service.reconcile(tenantId, { remoteOrderGids: ASSENTE, now: NOW });

    expect(result).toMatchObject({ missing: 1, released: 0 });
    expect(reservations.releaseOrderReservationsTx).not.toHaveBeenCalled();
    expect(tx.salesOrder.update).toHaveBeenCalledOnce();
  });

  // ── Il ritorno ────────────────────────────────────────────────────────────
  //
  // Una segnalazione che resta accesa su un ordine ricomparso è una
  // segnalazione falsa, e quelle insegnano a ignorare anche le vere.
  it('un ordine segnalato che ricompare perde la segnalazione', async () => {
    const { service, prisma } = setup({
      flagged: [{ id: 'so-1', shopifyOrderId: 'gid://shopify/Order/1001' }],
    });

    const result = await service.reconcile(tenantId, { remoteOrderGids: PRESENTE, now: NOW });

    expect(result.reappeared).toBe(1);
    expect(prisma.salesOrder.updateMany).toHaveBeenCalledWith({
      // Il vincolo di tenant c'è anche qui: un update di massa senza è il tipo
      // di riga che diventa pericolosa appena qualcuno la copia altrove.
      where: { tenantId, id: { in: ['so-1'] } },
      data: { channelMissingSince: null },
    });
  });

  it('un ordine segnalato che continua a mancare resta com’è', async () => {
    const { service, prisma } = setup({
      flagged: [{ id: 'so-1', shopifyOrderId: 'gid://shopify/Order/1001' }],
    });

    const result = await service.reconcile(tenantId, { remoteOrderGids: ASSENTE, now: NOW });

    expect(result.reappeared).toBe(0);
    expect(prisma.salesOrder.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * Le falle cercate a posteriori, provando a rompere la logica.
 *
 * Tutte e tre hanno lo stesso esito peggiore: segnalare come cancellati ordini
 * vivi e liberarne gli impegni, cioè dare per disponibile merce già venduta.
 */
describe('ShopifyMissingOrdersService — falle cercate', () => {
  beforeEach(() => vi.clearAllMocks());

  function candidatiFinti(quanti: number) {
    return Array.from({ length: quanti }, (_, index) => ({
      id: `so-${index}`,
      orderNumber: `#${1000 + index}`,
      shopifyOrderId: `gid://shopify/Order/${1000 + index}`,
      fulfilledAt: null,
    }));
  }

  // FALLA 1 — la paginazione può troncare in silenzio: `listAllOrders` chiude
  // il ciclo su `page.orders ?? []`, quindi una pagina 2xx senza quella chiave
  // restituisce un elenco parziale senza sollevare niente.
  //
  // FALLA 2 — dopo un cambio di negozio Shopify gli ordini del negozio
  // precedente non compaiono più: stiamo interrogando un altro negozio.
  //
  // Si presentano identiche: tanti ordini assenti tutti insieme.
  it('non crede a un’assenza di massa, e non libera niente', async () => {
    const { service, tx, reservations } = setup({ candidates: candidatiFinti(20) });

    const result = await service.reconcile(tenantId, {
      remoteOrderGids: new Set(['gid://shopify/Order/9999']),
      now: NOW,
    });

    expect(result.missing).toBe(0);
    expect(result.inconclusive).toContain('Il controllo non è stato eseguito');
    expect(tx.salesOrder.update).not.toHaveBeenCalled();
    expect(reservations.releaseOrderReservationsTx).not.toHaveBeenCalled();
  });

  // Il controllo inverso: la guardia non deve spegnere la funzione nel caso
  // normale, cioè poche cancellazioni vere in mezzo a tanti ordini sani.
  it('poche assenze in mezzo a molti ordini vengono segnalate', async () => {
    const candidates = candidatiFinti(20);
    const presenti = candidates.slice(2).map((order) => order.shopifyOrderId);
    const { service, tx } = setup({ candidates });

    const result = await service.reconcile(tenantId, {
      remoteOrderGids: new Set(presenti),
      now: NOW,
    });

    expect(result.missing).toBe(2);
    expect(tx.salesOrder.update).toHaveBeenCalledTimes(2);
  });

  // FALLA 3 — l'id locale può essere stato scritto come numero nudo invece che
  // come GID. Confrontando solo la forma GID, quell'ordine risulterebbe sparito
  // pur essendo presente.
  it('un id locale in forma numerica non viene scambiato per sparito', async () => {
    const { service, tx } = setup({
      candidates: [localOrder({ shopifyOrderId: '1001' })],
    });

    const result = await service.reconcile(tenantId, { remoteOrderGids: PRESENTE, now: NOW });

    expect(result.missing).toBe(0);
    expect(tx.salesOrder.update).not.toHaveBeenCalled();
  });

  it('l’elenco remoto vuoto dice perché non ha concluso', async () => {
    const { service } = setup({ candidates: [localOrder()] });

    const result = await service.reconcile(tenantId, {
      remoteOrderGids: new Set<string>(),
      now: NOW,
    });

    expect(result.inconclusive).toContain('non ha restituito nessun ordine');
  });
});
