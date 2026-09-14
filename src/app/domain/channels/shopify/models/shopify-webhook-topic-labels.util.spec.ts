import { describe, expect, it } from 'vitest';

import { descriviNotifiche, funzioneDellaNotifica } from './shopify-webhook-topic-labels.util';

describe('shopify-webhook-topic-labels.util — le funzioni dietro ai topic', () => {
  it('ogni topic previsto dall’API ha una funzione in italiano, e i due della sede degli ordini la stessa', () => {
    const previsti = [
      'orders/create',
      'orders/updated',
      'orders/cancelled',
      'customers/create',
      'customers/update',
      'inventory_levels/update',
      'products/create',
      'products/update',
      'fulfillment_orders/moved',
      'fulfillment_orders/order_routing_complete',
    ];
    for (const topic of previsti) {
      expect(funzioneDellaNotifica(topic), topic).not.toBe(topic);
      expect(funzioneDellaNotifica(topic), topic).not.toMatch(/[_/]/);
    }
    expect(funzioneDellaNotifica('fulfillment_orders/moved')).toBe(
      funzioneDellaNotifica('fulfillment_orders/order_routing_complete'),
    );
  });

  it('un topic ignoto resta col suo nome: nessuna funzione inventata', () => {
    expect(funzioneDellaNotifica('refunds/create')).toBe('refunds/create');
  });

  it('lega le funzioni in una frase, senza ripetere quella condivisa da due topic', () => {
    expect(
      descriviNotifiche(['fulfillment_orders/moved', 'fulfillment_orders/order_routing_complete']),
    ).toBe('la sede assegnata agli ordini');
    expect(descriviNotifiche(['orders/cancelled', 'customers/create'])).toBe(
      'gli annullamenti degli ordini e i clienti nuovi',
    );
    expect(
      descriviNotifiche(['orders/create', 'customers/create', 'inventory_levels/update']),
    ).toBe('gli ordini nuovi, i clienti nuovi e le quantità del negozio');
    expect(descriviNotifiche([])).toBe('');
  });
});
