import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyConfigService } from './shopify-config.service';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyCryptoService } from './shopify-crypto.service';
import type { ShopifyWebhookReaderClient } from './shopify-webhook-reader.client';
import { ShopifyWebhookStatusService } from './shopify-webhook-status.service';

const CONFIGURED = 'https://vestiflow-production.up.railway.app/api/v1/shopify/webhooks';
const LOCALHOST = 'http://localhost:3000/api/v1/shopify/webhooks';

const ALL_TOPICS = [
  'inventory_levels/update',
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'customers/create',
  'customers/update',
  'products/create',
  'products/update',
];

describe('ShopifyWebhookStatusService', () => {
  function createService(
    subscriptions: readonly { topic: string; address: string }[],
    options: { readonly configuredAddress?: string | null; readonly credential?: unknown } = {},
  ) {
    const listWebhooks = vi.fn().mockResolvedValue(subscriptions.map((s, i) => ({ id: `${i}`, ...s })));
    const recordWebhooksObserved = vi.fn().mockResolvedValue(new Date('2026-08-08T17:00:00.000Z'));

    const prisma = {
      shopifyCredential: {
        findUnique: vi.fn().mockResolvedValue(
          options.credential === undefined
            ? { shopDomain: 'shop.myshopify.com', accessTokenEnc: 'cifrato' }
            : options.credential,
        ),
      },
    };

    const service = new ShopifyWebhookStatusService(
      { listWebhooks } as unknown as ShopifyWebhookReaderClient,
      { recordWebhooksObserved } as unknown as ShopifyConnectionService,
      {
        webhookUrl:
          options.configuredAddress === undefined ? CONFIGURED : (options.configuredAddress ?? undefined),
      } as unknown as ShopifyConfigService,
      { decrypt: vi.fn().mockReturnValue('token') } as unknown as ShopifyCryptoService,
      prisma as unknown as PrismaService,
    );

    return { service, listWebhooks, recordWebhooksObserved };
  }

  it('negozio a posto: nessun mancante e indirizzo che coincide', async () => {
    const { service } = createService(ALL_TOPICS.map((topic) => ({ topic, address: CONFIGURED })));

    const result = await service.check('tenant-1');

    expect(result.topics).toHaveLength(8);
    expect(result.missingTopics).toEqual([]);
    expect(result.addressMatchesConfigured).toBe(true);
    expect(result.otherAddresses).toEqual([]);
  });

  it('il caso reale: sette topic e orders/cancelled nominato fra i mancanti', async () => {
    const { service } = createService(
      ALL_TOPICS.filter((topic) => topic !== 'orders/cancelled').map((topic) => ({
        topic,
        address: CONFIGURED,
      })),
    );

    const result = await service.check('tenant-1');

    expect(result.topics).toHaveLength(7);
    expect(result.missingTopics).toEqual(['orders/cancelled']);
    expect(result.addressMatchesConfigured).toBe(true);
  });

  it('registra sempre l osservazione, con la sua data', async () => {
    const { service, recordWebhooksObserved } = createService([
      { topic: 'orders/create', address: CONFIGURED },
    ]);

    const result = await service.check('tenant-1');

    expect(recordWebhooksObserved).toHaveBeenCalledWith('tenant-1', {
      topics: ['orders/create'],
      address: CONFIGURED,
    });
    expect(result.checkedAt).toBe('2026-08-08T17:00:00.000Z');
  });

  it('nessuna sottoscrizione: «verificato, zero» resta una scrittura, non un silenzio', async () => {
    const { service, recordWebhooksObserved } = createService([]);

    const result = await service.check('tenant-1');

    // La data viene scritta comunque: e' cio' che distingue «verificato, zero» da
    // «non abbiamo mai guardato», e senza quella scrittura la spia resterebbe muta.
    expect(recordWebhooksObserved).toHaveBeenCalledWith('tenant-1', { topics: [], address: null });
    expect(result.observedAddress).toBeNull();
    expect(result.addressMatchesConfigured).toBeNull();
    expect(result.missingTopics).toHaveLength(8);
  });

  it('sottoscrizioni verso un altro indirizzo: consegnano altrove, e si vede', async () => {
    const { service } = createService(
      ALL_TOPICS.map((topic) => ({ topic, address: LOCALHOST })),
    );

    const result = await service.check('tenant-1');

    expect(result.observedAddress).toBe(LOCALHOST);
    expect(result.addressMatchesConfigured).toBe(false);
  });

  it('due gruppi: vince l indirizzo configurato e l altro resta visibile, non nascosto', async () => {
    const { service } = createService([
      { topic: 'orders/create', address: CONFIGURED },
      { topic: 'orders/create', address: LOCALHOST },
      { topic: 'products/update', address: LOCALHOST },
    ]);

    const result = await service.check('tenant-1');

    expect(result.observedAddress).toBe(CONFIGURED);
    expect(result.addressMatchesConfigured).toBe(true);
    // Il gruppo estraneo e' piu' popoloso e vince comunque quello configurato: e' l'unico
    // a cui gli eventi arrivano davvero qui. Ma l'altro non sparisce dal referto.
    expect(result.otherAddresses).toEqual([{ address: LOCALHOST, topicCount: 2 }]);
    expect(result.totalSubscriptions).toBe(3);
  });

  it('indirizzo non configurato sul server: non confrontabile, non sbagliato', async () => {
    const { service } = createService([{ topic: 'orders/create', address: LOCALHOST }], {
      configuredAddress: null,
    });

    const result = await service.check('tenant-1');

    expect(result.configuredAddress).toBeNull();
    expect(result.addressMatchesConfigured).toBeNull();
  });

  it('senza credenziale non inventa una diagnosi', async () => {
    const { service, listWebhooks } = createService([], { credential: null });

    await expect(service.check('tenant-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(listWebhooks).not.toHaveBeenCalled();
  });
});
