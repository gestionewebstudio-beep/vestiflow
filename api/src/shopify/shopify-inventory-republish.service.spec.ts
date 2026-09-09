import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type {
  ShopifyInventoryPushResult,
  ShopifyInventoryPushService,
} from './shopify-inventory-push.service';
import { ShopifyInventoryRepublishService } from './shopify-inventory-republish.service';

const tenantId = 'tenant-1';

function pending(quanti: number) {
  return Array.from({ length: quanti }, (_, index) => ({
    variantId: `var-${index}`,
    locationId: 'loc-1',
  }));
}

/**
 * ⛔ **`ripubblicaDisallineamento` restituisce un ESITO, non `undefined`.** La stesura
 *    precedente lo simulava con `mockResolvedValue(undefined)` e col rifiuto
 *    come eccezione: due cose che il servizio vero non fa mai — cattura i propri
 *    errori e restituisce sempre un oggetto. Un finto che si comporta
 *    diversamente dall'originale fa passare prove che l'originale non
 *    supererebbe, ed è esattamente come il difetto degli esiti era sopravvissuto.
 */
function esitoPush(
  overrides: Partial<ShopifyInventoryPushResult> = {},
): ShopifyInventoryPushResult {
  return { pushed: true, publishableAvailable: 5, ...overrides };
}

function setup(
  options: {
    readonly rows?: readonly unknown[];
    /** L'esito che il push restituisce, per ogni riga in ordine. */
    readonly esiti?: readonly ShopifyInventoryPushResult[];
    /** Il push SOLLEVA, invece di restituire: caso raro ma possibile. */
    readonly pushSolleva?: boolean;
  } = {},
) {
  const rows = options.rows ?? [];
  // ⭐ Il marcatore si spegne solo per un invio riuscito: la riconta finale
  //    deve rifletterlo, o la prova misurerebbe un database che non esiste.
  let riusciti = 0;
  let chiamate = 0;

  const prisma = {
    shopifyInventorySyncState: {
      count: vi.fn(() => Promise.resolve(rows.length - riusciti)),
      findMany: vi.fn((args: { take: number }) => Promise.resolve(rows.slice(0, args.take))),
    },
  };
  const inventoryPush = {
    /**
     * ⭐ **La porta di RECUPERO, non `pushLevel`.** Fingere quella ordinaria
     *    farebbe passare un ritentativo che non ha mai superato la scorciatoia
     *    dell'«invariata»: la prova misurerebbe una chiamata che il servizio non
     *    fa più.
     */
    ripubblicaDisallineamento: vi.fn(() => {
      if (options.pushSolleva) {
        return Promise.reject(new Error('Shopify non raggiungibile'));
      }
      const esito = options.esiti?.[chiamate] ?? esitoPush();
      chiamate += 1;
      if (esito.pushed) {
        riusciti += 1;
      }
      return Promise.resolve(esito);
    }),
  };
  const service = new ShopifyInventoryRepublishService(
    prisma as unknown as PrismaService,
    inventoryPush as unknown as ShopifyInventoryPushService,
  );
  return { service, prisma, inventoryPush };
}

/**
 * La rete di recupero della riconciliazione inventario.
 *
 * ⛔ **Le attese sono cambiate il 09/09/2026.** Prima l'esito aveva un campo
 *    solo, `succeeded`, e contava ogni chiamata che non avesse sollevato: poiché
 *    `pushLevel` non solleva mai, contava come riuscite anche le righe per cui
 *    non era partito niente. Ora le classi sono quattro e la riuscita è **un
 *    invio confermato**.
 */
describe('ShopifyInventoryRepublishService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('senza disallineamenti non chiama Shopify', async () => {
    const { service, inventoryPush } = setup();

    const result = await service.retryPending(tenantId);

    expect(result).toEqual({
      pending: 0,
      attempted: 0,
      republished: 0,
      unchanged: 0,
      refused: 0,
      failed: 0,
      remaining: 0,
    });
    expect(inventoryPush.ripubblicaDisallineamento).not.toHaveBeenCalled();
  });

  // Il controllo inverso: senza, il test qui sopra passerebbe anche se il
  // servizio non ripubblicasse mai niente.
  it('con disallineamenti in coda li ripubblica e svuota la coda', async () => {
    const { service, inventoryPush } = setup({ rows: pending(3) });

    const result = await service.retryPending(tenantId);

    expect(inventoryPush.ripubblicaDisallineamento).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ pending: 3, attempted: 3, republished: 3, remaining: 0 });
  });

  it('⛔ un invio NON effettuato non è una riuscita', async () => {
    // È il caso canonico del disallineamento: il push non ha niente da mandare
    // perché l'ultimo inviato coincide col disponibile.
    const { service } = setup({
      rows: pending(2),
      esiti: [
        { pushed: false, reason: 'unchanged', publishableAvailable: 5 },
        { pushed: false, reason: 'unchanged', publishableAvailable: 5 },
      ],
    });

    const result = await service.retryPending(tenantId);

    expect(result).toMatchObject({ attempted: 2, republished: 0, unchanged: 2, remaining: 2 });
  });

  it('⛔ un collegamento ESCLUSO è un rifiuto, non un fallimento e non una riuscita', async () => {
    const { service } = setup({
      rows: pending(1),
      esiti: [{ pushed: false, reason: 'collegamento_escluso', publishableAvailable: 5 }],
    });

    const result = await service.retryPending(tenantId);

    expect(result).toMatchObject({ republished: 0, refused: 1, failed: 0, remaining: 1 });
  });

  it('un errore del canale è un fallimento, e non svuota la coda', async () => {
    const { service } = setup({
      rows: pending(3),
      esiti: [
        { pushed: false, reason: 'shopify_error' },
        { pushed: false, reason: 'shopify_error' },
        { pushed: false, reason: 'shopify_error' },
      ],
    });

    const result = await service.retryPending(tenantId);

    expect(result).toMatchObject({ attempted: 3, republished: 0, failed: 3, remaining: 3 });
  });

  // Un fallimento non deve fermare gli altri: sono righe indipendenti, e
  // recuperarne nove su dieci è meglio che nessuna.
  it('se il push SOLLEVA, tenta comunque tutte le righe e non svuota la coda', async () => {
    const { service, inventoryPush } = setup({ rows: pending(3), pushSolleva: true });

    const result = await service.retryPending(tenantId);

    expect(inventoryPush.ripubblicaDisallineamento).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ attempted: 3, republished: 0, failed: 3, remaining: 3 });
  });

  it('un RINVIO in corso è «nessun invio», non una riuscita e non un errore', async () => {
    // ⚠️ Il rinvio non ha una classe sua — è una scelta dichiarata nel contratto
    //    dell'esito — ma non deve travestirsi da riuscita né da guasto: chi
    //    legge non deve andare a cercare un errore che non c'è.
    const { service } = setup({
      rows: pending(1),
      esiti: [{ pushed: false, reason: 'rinvio_attivo', publishableAvailable: 5 }],
    });

    const result = await service.retryPending(tenantId);

    expect(result).toMatchObject({
      attempted: 1,
      republished: 0,
      unchanged: 1,
      refused: 0,
      failed: 0,
      remaining: 1,
    });
  });

  it('⭐ lotto MISTO: le quattro classi sommano il tentato', async () => {
    const { service } = setup({
      rows: pending(4),
      esiti: [
        esitoPush(),
        { pushed: false, reason: 'unchanged' },
        { pushed: false, reason: 'collegamento_escluso' },
        { pushed: false, reason: 'shopify_error' },
      ],
    });

    const result = await service.retryPending(tenantId);

    expect(result.republished + result.unchanged + result.refused + result.failed).toBe(
      result.attempted,
    );
    expect(result).toMatchObject({ republished: 1, unchanged: 1, refused: 1, failed: 1 });
  });

  // L'Admin API e' a quota: una coda lunga svuotata tutta insieme se la mangia.
  // Ma quello che resta va DETTO — un tetto silenzioso si legge come «ho finito».
  it('oltre il tetto ne tenta una parte, e dichiara quanti restano', async () => {
    const { service, prisma, inventoryPush } = setup({ rows: pending(120) });

    const result = await service.retryPending(tenantId);

    expect(inventoryPush.ripubblicaDisallineamento).toHaveBeenCalledTimes(50);
    expect(result).toMatchObject({ pending: 120, attempted: 50, republished: 50, remaining: 70 });
    // I più vecchi per primi: una coda svuotata dal fondo lascia indietro
    // sempre le stesse righe.
    expect(prisma.shopifyInventorySyncState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { updatedAt: 'asc' } }),
    );
  });
});
