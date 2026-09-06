import { describe, expect, it } from 'vitest';

import { isShopifyDeliverableAddress } from './shopify-webhook-address.util';

describe('isShopifyDeliverableAddress', () => {
  // Il verso che conta di piu': dove l'indirizzo e' quello vero il confronto DEVE restare
  // acceso. Un controllo che si spegne per non dare falsi allarmi e non si riaccende mai e'
  // peggio del falso allarme che evita.
  it('l indirizzo pubblico di produzione e confrontabile', () => {
    expect(
      isShopifyDeliverableAddress(
        'https://vestiflow-production.up.railway.app/api/v1/shopify/webhooks',
      ),
    ).toBe(true);
  });

  it.each([
    ['http://localhost:3000/api/v1/shopify/webhooks', 'quello del modello .env.example'],
    ['https://localhost:3000/api/v1/shopify/webhooks', 'localhost anche in https'],
    ['http://127.0.0.1:3000/webhooks', 'loopback'],
    ['https://192.168.1.10/webhooks', 'rete privata'],
    ['https://10.0.0.5/webhooks', 'rete privata'],
    ['https://172.20.0.3/webhooks', 'rete privata'],
    ['https://mac-di-luigi.local/webhooks', 'nome di rete locale'],
    ['http://vestiflow.example/webhooks', 'senza TLS Shopify non consegna'],
    ['non-un-indirizzo', 'stringa che non e un URL'],
  ])('%s non e confrontabile (%s)', (address) => {
    expect(isShopifyDeliverableAddress(address)).toBe(false);
  });

  it('assente non e confrontabile', () => {
    expect(isShopifyDeliverableAddress(null)).toBe(false);
    expect(isShopifyDeliverableAddress(undefined)).toBe(false);
    expect(isShopifyDeliverableAddress('')).toBe(false);
  });
});
