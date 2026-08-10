import { describe, expect, it, vi } from 'vitest';

import type { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyWebhookRepairService } from './shopify-webhook-repair.service';
import type { ShopifyWebhookStatusService } from './shopify-webhook-status.service';

describe('ShopifyWebhookRepairService', () => {
  function createService(
    registration: { registered: string[]; skipped: string[]; failed: { topic: string; message: string }[] },
    checkResult: Record<string, unknown> = { missingTopics: [], topics: ['orders/cancelled'] },
  ) {
    const resyncWebhooks = vi.fn().mockResolvedValue(registration);
    const check = vi.fn().mockResolvedValue(checkResult);

    const service = new ShopifyWebhookRepairService(
      { resyncWebhooks } as unknown as ShopifyOAuthService,
      { check } as unknown as ShopifyWebhookStatusService,
    );

    return { service, resyncWebhooks, check };
  }

  it('registra e poi rimisura, in quest ordine', async () => {
    const order: string[] = [];
    const { service, resyncWebhooks, check } = createService({
      registered: ['orders/cancelled'],
      skipped: [],
      failed: [],
    });
    resyncWebhooks.mockImplementation(() => {
      order.push('registra');
      return Promise.resolve({ registered: [], skipped: [], failed: [] });
    });
    check.mockImplementation(() => {
      order.push('rimisura');
      return Promise.resolve({ missingTopics: [] });
    });

    await service.registerMissingAndRecheck('tenant-1');

    expect(order).toEqual(['registra', 'rimisura']);
  });

  it('restituisce la MISURA, non quello che la registrazione crede di aver fatto', async () => {
    // La registrazione dichiara di aver registrato il topic; la rilettura su Shopify dice
    // che non c'e'. Sono due modi diversi di sapere, e vince il secondo: e' il motivo per
    // cui le due meta' stanno in una sola azione invece che incatenate nel frontend.
    const { service } = createService(
      { registered: ['orders/cancelled'], skipped: [], failed: [] },
      { missingTopics: ['orders/cancelled'], topics: [] },
    );

    const result = await service.registerMissingAndRecheck('tenant-1');

    expect(result.missingTopics).toEqual(['orders/cancelled']);
  });

  it('usa la strada additiva, mai l interruttore', async () => {
    const { service, resyncWebhooks } = createService({
      registered: [],
      skipped: ['orders/create'],
      failed: [],
    });

    await service.registerMissingAndRecheck('tenant-1');

    // `resyncWebhooks` salta i presenti e aggiunge i mancanti. Se un domani qualcuno la
    // sostituisse con spegni-e-riaccendi, qui comparirebbe `disableWebhooks`.
    expect(resyncWebhooks).toHaveBeenCalledWith('tenant-1');
  });

  it('se la registrazione fallisce non si finge una riparazione', async () => {
    const { service, resyncWebhooks, check } = createService({
      registered: [],
      skipped: [],
      failed: [],
    });
    resyncWebhooks.mockRejectedValue(new Error('indirizzo non consegnabile'));

    await expect(service.registerMissingAndRecheck('tenant-1')).rejects.toThrow(
      'indirizzo non consegnabile',
    );
    expect(check).not.toHaveBeenCalled();
  });
});
