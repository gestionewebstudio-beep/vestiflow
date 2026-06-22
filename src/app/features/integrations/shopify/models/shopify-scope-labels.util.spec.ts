import { describe, expect, it } from 'vitest';

import { shopifyScopeAccessLabel, shopifyScopeDisplay } from './shopify-scope-labels.util';

describe('shopify-scope-labels.util', () => {
  it('mappa scope noti con label italiana', () => {
    const display = shopifyScopeDisplay('read_products');
    expect(display.label).toBe('Catalogo prodotti');
    expect(display.access).toBe('read');
    expect(shopifyScopeAccessLabel('read')).toBe('Lettura');
  });

  it('genera fallback per scope sconosciuti', () => {
    const display = shopifyScopeDisplay('write_discounts');
    expect(display.access).toBe('write');
    expect(display.label).toBe('Discounts');
    expect(display.description).toContain('write_discounts');
  });

  it('copre tutti gli scope definiti in SCOPE_DISPLAY', () => {
    const knownScopes = [
      'read_orders',
      'write_orders',
      'read_customers',
      'write_customers',
      'read_inventory',
      'write_inventory',
      'read_locations',
      'write_locations',
      'read_products',
      'write_products',
    ];
    for (const scope of knownScopes) {
      expect(shopifyScopeDisplay(scope).label).toBeTruthy();
    }
    expect(shopifyScopeAccessLabel('write')).toBe('Scrittura');
  });
});
