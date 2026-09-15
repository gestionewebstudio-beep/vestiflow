import { describe, expect, it } from 'vitest';

import { risorsaDelWebhook } from './shopify-webhook-risorsa.util';

describe('shopify-webhook-risorsa.util — la risorsa che conserva l ordine', () => {
  it('tutti i topic dello STESSO ordine convergono sulla stessa chiave, in qualunque forma arrivi l id', () => {
    expect(risorsaDelWebhook('orders/create', { id: 5001 })).toBe('ordine:5001');
    expect(risorsaDelWebhook('orders/updated', { id: '5001' })).toBe('ordine:5001');
    expect(
      risorsaDelWebhook('orders/cancelled', { admin_graphql_api_id: 'gid://shopify/Order/5001' }),
    ).toBe('ordine:5001');
    expect(
      risorsaDelWebhook('fulfillment_orders/order_routing_complete', {
        fulfillment_order: { id: 'gid://shopify/FulfillmentOrder/9', order_id: 5001 },
      }),
    ).toBe('ordine:5001');
    expect(
      risorsaDelWebhook('fulfillment_orders/moved', {
        moved_fulfillment_order: { id: 9, order_id: 'gid://shopify/Order/5001' },
      }),
    ).toBe('ordine:5001');
  });

  it('prodotti, clienti e quantità hanno ciascuno la propria chiave; la coppia articolo×sede è una risorsa sola', () => {
    expect(risorsaDelWebhook('products/update', { id: 42 })).toBe('prodotto:42');
    expect(risorsaDelWebhook('customers/create', { id: 7 })).toBe('cliente:7');
    expect(
      risorsaDelWebhook('inventory_levels/update', { inventory_item_id: 11, location_id: 22 }),
    ).toBe('inventario:11@22');
  });

  it('⛔ una risorsa NON risolvibile è null, non una chiave inventata: non scavalca e non è scavalcata', () => {
    expect(risorsaDelWebhook('orders/create', {})).toBeNull();
    expect(risorsaDelWebhook('orders/create', { id: 'non-un-id' })).toBeNull();
    expect(risorsaDelWebhook('fulfillment_orders/moved', { fulfillment_order: { id: 9 } })).toBeNull();
    expect(risorsaDelWebhook('inventory_levels/update', { inventory_item_id: 11 })).toBeNull();
    expect(risorsaDelWebhook('orders/create', null)).toBeNull();
    expect(risorsaDelWebhook('orders/create', [1])).toBeNull();
    expect(risorsaDelWebhook('app/uninstalled', { id: 1 })).toBeNull();
  });
});
