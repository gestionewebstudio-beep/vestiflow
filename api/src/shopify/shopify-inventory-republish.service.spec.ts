import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyInventoryPushService } from './shopify-inventory-push.service';
import { ShopifyInventoryRepublishService } from './shopify-inventory-republish.service';

const tenantId = 'tenant-1';

function pending(quanti: number) {
  return Array.from({ length: quanti }, (_, index) => ({
    variantId: `var-${index}`,
    locationId: 'loc-1',
  }));
}

function setup(options: { readonly rows?: readonly unknown[]; readonly pushFails?: boolean } = {}) {
  const rows = options.rows ?? [];
  const prisma = {
    shopifyInventorySyncState: {
      count: vi.fn().mockResolvedValue(rows.length),
      findMany: vi.fn((args: { take: number }) => Promise.resolve(rows.slice(0, args.take))),
    },
  };
  const inventoryPush = {
    pushLevel: options.pushFails
      ? vi.fn().mockRejectedValue(new Error('Shopify non raggiungibile'))
      : vi.fn().mockResolvedValue(undefined),
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
 * Prima non esisteva: la ripubblicazione era un tentativo solo, lanciato senza
 * attenderne l'esito, e se falliva restava un flag che nessuno leggeva e che
 * nessuno riprovava — divergenza per sempre, in silenzio.
 */
describe('ShopifyInventoryRepublishService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('senza disallineamenti non chiama Shopify', async () => {
    const { service, inventoryPush } = setup();

    const result = await service.retryPending(tenantId);

    expect(result).toEqual({ pending: 0, attempted: 0, succeeded: 0, remaining: 0 });
    expect(inventoryPush.pushLevel).not.toHaveBeenCalled();
  });

  // Il controllo inverso: senza, il test qui sopra passerebbe anche se il
  // servizio non ripubblicasse mai niente.
  it('con disallineamenti in coda li ripubblica e svuota la coda', async () => {
    const { service, inventoryPush } = setup({ rows: pending(3) });

    const result = await service.retryPending(tenantId);

    expect(inventoryPush.pushLevel).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ pending: 3, attempted: 3, succeeded: 3, remaining: 0 });
  });

  // Un fallimento non deve fermare gli altri: sono righe indipendenti, e
  // recuperarne nove su dieci è meglio che nessuna.
  it('se Shopify rifiuta, tenta comunque tutte le righe e non svuota la coda', async () => {
    const { service, inventoryPush } = setup({ rows: pending(3), pushFails: true });

    const result = await service.retryPending(tenantId);

    expect(inventoryPush.pushLevel).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ attempted: 3, succeeded: 0, remaining: 3 });
  });

  // L'Admin API e' a quota: una coda lunga svuotata tutta insieme se la mangia.
  // Ma quello che resta va DETTO — un tetto silenzioso si legge come «ho finito».
  it('oltre il tetto ne tenta una parte, e dichiara quanti restano', async () => {
    const { service, prisma, inventoryPush } = setup({ rows: pending(120) });

    const result = await service.retryPending(tenantId);

    expect(inventoryPush.pushLevel).toHaveBeenCalledTimes(50);
    expect(result).toMatchObject({ pending: 120, attempted: 50, succeeded: 50, remaining: 70 });
    // I più vecchi per primi: una coda svuotata dal fondo lascia indietro
    // sempre le stesse righe.
    expect(prisma.shopifyInventorySyncState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { updatedAt: 'asc' } }),
    );
  });
});
