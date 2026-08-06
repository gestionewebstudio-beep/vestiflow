import { describe, expect, it } from 'vitest';

import { mapInventoryLevelListItem } from './inventory-list.mapper';

describe('mapInventoryLevelListItem', () => {
  it('compone titolo variante da ref API', () => {
    const item = mapInventoryLevelListItem({
      id: 'lvl-1',
      tenantId: 'tenant-1',
      variantId: 'var-1',
      locationId: 'loc-1',
      onHand: 1,
      available: 1,
      committed: 0,
      incoming: 0,
      reserved: 0,
      minThreshold: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
      variant: {
        sku: 'SKU-M',
        optionValues: [
          { name: 'Taglia', value: 'M' },
          { name: 'Colore', value: 'Bianco' },
        ],
        product: { name: 'Maglietta' },
      },
      location: { name: 'Negozio' },
    });

    expect(item.displaySku).toBe('SKU-M');
    expect(item.displayTitle).toBe('Maglietta — M / Bianco');
    expect(item.locationName).toBe('Negozio');
  });
});
