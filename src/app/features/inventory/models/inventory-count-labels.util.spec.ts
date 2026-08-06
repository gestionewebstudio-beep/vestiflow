import { describe, expect, it } from 'vitest';

import { InventoryCountStatus } from '@core/models/inventory-count.model';

import { inventoryCountStatusLabel, inventoryCountStatusTone } from './inventory-count-labels.util';

describe('inventory-count-labels.util', () => {
  for (const status of Object.values(InventoryCountStatus)) {
    it(`copre InventoryCountStatus.${status}`, () => {
      expect(inventoryCountStatusLabel(status)).toBeTruthy();
      expect(inventoryCountStatusTone(status)).toBeTruthy();
    });
  }
});
