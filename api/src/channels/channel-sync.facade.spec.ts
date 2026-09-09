import { TenantChannelProfile } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyInventoryPushService } from '../shopify/shopify-inventory-push.service';
import type { ShopifyProductPushService } from '../shopify/shopify-product-push.service';
import type { TikTokInventoryPushService } from '../tiktok/tiktok-inventory-push.service';
import type { TikTokProductPushService } from '../tiktok/tiktok-product-push.service';
import { ChannelSyncFacade } from './channel-sync.facade';

function setup(profile: TenantChannelProfile | null) {
  const findUnique = vi
    .fn()
    .mockResolvedValue(profile === null ? null : { channelProfile: profile });
  const prisma = { tenant: { findUnique } } as unknown as PrismaService;

  const shopifyInventoryPush = { pushLevels: vi.fn().mockResolvedValue(undefined) };
  const shopifyProductPush = {
    enqueuePush: vi.fn().mockResolvedValue({ pushed: true }),
    // ⛔ Nessun `deleteProduct`: il servizio di push non lo espone piu'.
    archiveOnSyncDisabled: vi.fn().mockResolvedValue({ pushed: true }),
  };
  const tiktokInventoryPush = { pushVariantStock: vi.fn().mockResolvedValue(undefined) };
  const tiktokProductPush = { enqueuePush: vi.fn().mockResolvedValue({ pushed: true }) };

  const facade = new ChannelSyncFacade(
    prisma,
    shopifyInventoryPush as unknown as ShopifyInventoryPushService,
    shopifyProductPush as unknown as ShopifyProductPushService,
    tiktokInventoryPush as unknown as TikTokInventoryPushService,
    tiktokProductPush as unknown as TikTokProductPushService,
  );

  return {
    facade,
    findUnique,
    shopifyInventoryPush,
    shopifyProductPush,
    tiktokInventoryPush,
    tiktokProductPush,
  };
}

describe('ChannelSyncFacade', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('profilo «solo gestionale»', () => {
    it('non tocca alcun canale sul push inventario', async () => {
      const t = setup(TenantChannelProfile.gestionale);

      await t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']);

      expect(t.shopifyInventoryPush.pushLevels).not.toHaveBeenCalled();
      expect(t.tiktokInventoryPush.pushVariantStock).not.toHaveBeenCalled();
    });

    it('non tocca alcun canale sul push prodotto', async () => {
      const t = setup(TenantChannelProfile.gestionale);

      await t.facade.pushProductNow('tenant-1', 'prod-1');

      expect(t.shopifyProductPush.enqueuePush).not.toHaveBeenCalled();
      expect(t.tiktokProductPush.enqueuePush).not.toHaveBeenCalled();
    });

    // ⛔ Qui c'era «deleteProduct riporta not_connected senza interrogare
    //    Shopify». Il metodo non esiste piu' sul facade: VestiFlow non cancella
    //    su Shopify (docs/24 §11.1), e la prova che conta ora e' l'assenza
    //    della capacita', verificata sotto.
    it('il facade non espone nessun modo di cancellare un prodotto sul canale', () => {
      const t = setup(TenantChannelProfile.shopify);

      expect((t.facade as unknown as Record<string, unknown>).deleteProduct).toBeUndefined();
    });

    it('lo spegnimento della sync non interroga Shopify e non annulla niente', async () => {
      const t = setup(TenantChannelProfile.gestionale);

      const result = await t.facade.archiveProductOnSyncDisabled('tenant-1', 'prod-1');

      // `not_linked`, non `shopify_error`: chi chiama deve lasciare il flag spento.
      // ⭐ 26.2 · e `outcome: 'saltato'`, che dice la stessa cosa in una parola:
      //    non è un fallimento, è una precondizione che non c'era.
      expect(result).toEqual({ pushed: false, outcome: 'saltato', reason: 'not_linked' });
      expect(t.shopifyProductPush.archiveOnSyncDisabled).not.toHaveBeenCalled();
    });
  });

  describe('profilo Shopify', () => {
    it('push inventario va solo a Shopify', async () => {
      const t = setup(TenantChannelProfile.shopify);

      await t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']);

      expect(t.shopifyInventoryPush.pushLevels).toHaveBeenCalledWith('tenant-1', 'var-1', [
        'loc-1',
      ]);
      expect(t.tiktokInventoryPush.pushVariantStock).not.toHaveBeenCalled();
    });

    it('non propaga gli errori del canale', async () => {
      const t = setup(TenantChannelProfile.shopify);
      t.shopifyInventoryPush.pushLevels.mockRejectedValue(new Error('rate limit'));

      await expect(
        t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']),
      ).resolves.toBeUndefined();
    });

    // ⛔ La prova che il vecchio `enqueueProductSyncDisabled` non è tornato: un
    //    fire-and-forget si risolve SUBITO, e questo test diventerebbe rosso.
    describe('lo spegnimento della sync ASPETTA Shopify', () => {
      it("non si risolve finché l'archiviazione è in volo", async () => {
        const t = setup(TenantChannelProfile.shopify);
        let concludi: (esito: { pushed: boolean }) => void = () => {};
        t.shopifyProductPush.archiveOnSyncDisabled.mockReturnValue(
          new Promise((resolve) => {
            concludi = resolve;
          }),
        );

        let risolta = false;
        const attesa = t.facade
          .archiveProductOnSyncDisabled('tenant-1', 'prod-1')
          .then((esito) => {
            risolta = true;
            return esito;
          });

        // ⛔ Un giro di macrotask, non due microtask: la facade legge prima il
        //    profilo del tenant, quindi anche il percorso fire-and-forget si
        //    risolve dopo qualche tick — e due `await Promise.resolve()` lo
        //    lascerebbero passare. Misurato: il test così scritto era VERDE
        //    anche rimettendo il `void`.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(risolta).toBe(false);

        concludi({ pushed: true });
        await expect(attesa).resolves.toEqual({ pushed: true });
      });

      it("riporta l'esito al chiamante, rifiuto compreso", async () => {
        const t = setup(TenantChannelProfile.shopify);
        t.shopifyProductPush.archiveOnSyncDisabled.mockResolvedValue({
          pushed: false,
          reason: 'shopify_error',
        });

        await expect(
          t.facade.archiveProductOnSyncDisabled('tenant-1', 'prod-1'),
        ).resolves.toEqual({ pushed: false, reason: 'shopify_error' });
        expect(t.shopifyProductPush.archiveOnSyncDisabled).toHaveBeenCalledWith(
          'tenant-1',
          'prod-1',
        );
      });
    });
  });

  describe('profilo TikTok Shop', () => {
    it('push inventario va solo a TikTok', async () => {
      const t = setup(TenantChannelProfile.tiktok_shop);

      await t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']);

      expect(t.tiktokInventoryPush.pushVariantStock).toHaveBeenCalledWith('tenant-1', 'var-1');
      expect(t.shopifyInventoryPush.pushLevels).not.toHaveBeenCalled();
    });
  });

  describe('cache del profilo', () => {
    it('interroga il tenant una sola volta per push ripetuti', async () => {
      const t = setup(TenantChannelProfile.shopify);

      await t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']);
      await t.facade.pushInventoryLevels('tenant-1', 'var-2', ['loc-1']);
      await t.facade.pushInventoryLevels('tenant-1', 'var-3', ['loc-1']);

      expect(t.findUnique).toHaveBeenCalledTimes(1);
      expect(t.shopifyInventoryPush.pushLevels).toHaveBeenCalledTimes(3);
    });

    it('invalidateProfile forza una nuova lettura', async () => {
      const t = setup(TenantChannelProfile.shopify);

      await t.facade.pushInventoryLevels('tenant-1', 'var-1', ['loc-1']);
      t.facade.invalidateProfile('tenant-1');
      await t.facade.pushInventoryLevels('tenant-1', 'var-2', ['loc-1']);

      expect(t.findUnique).toHaveBeenCalledTimes(2);
    });

    it('tenant inesistente non tocca alcun canale', async () => {
      const t = setup(null);

      await t.facade.pushInventoryLevels('ignoto', 'var-1', ['loc-1']);

      expect(t.shopifyInventoryPush.pushLevels).not.toHaveBeenCalled();
      expect(t.tiktokInventoryPush.pushVariantStock).not.toHaveBeenCalled();
    });
  });
});
