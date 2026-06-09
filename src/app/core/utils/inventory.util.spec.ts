import { describe, expect, it } from 'vitest';

import type { InventoryLevel } from '../models/inventory-level.model';
import { StockStatus } from '../models/inventory-level.model';
import {
  isLowStock,
  stockStatusOf,
  sumInventoryQuantities,
  totalAvailable,
} from './inventory.util';

function level(partial: Partial<InventoryLevel>): InventoryLevel {
  return {
    id: 'lvl-1',
    variantId: 'var-1',
    locationId: 'loc-1',
    onHand: 0,
    available: 0,
    committed: 0,
    incoming: 0,
    reserved: 0,
    minThreshold: 5,
    ...partial,
  };
}

describe('stockStatusOf', () => {
  it('Empty quando available <= 0 (incluso oversell negativo)', () => {
    expect(stockStatusOf(level({ available: 0 }))).toBe(StockStatus.Empty);
    expect(stockStatusOf(level({ available: -3 }))).toBe(StockStatus.Empty);
  });

  it('Low quando available <= minThreshold', () => {
    expect(stockStatusOf(level({ available: 5, minThreshold: 5 }))).toBe(StockStatus.Low);
    expect(stockStatusOf(level({ available: 1, minThreshold: 5 }))).toBe(StockStatus.Low);
  });

  it('Ok quando available > minThreshold', () => {
    expect(stockStatusOf(level({ available: 6, minThreshold: 5 }))).toBe(StockStatus.Ok);
  });
});

describe('isLowStock', () => {
  it('true per Low ed Empty, false per Ok', () => {
    expect(isLowStock(level({ available: 0 }))).toBe(true);
    expect(isLowStock(level({ available: 3, minThreshold: 5 }))).toBe(true);
    expect(isLowStock(level({ available: 10, minThreshold: 5 }))).toBe(false);
  });
});

describe('totalAvailable', () => {
  it('somma il disponibile anche con valori negativi', () => {
    const levels = [level({ available: 10 }), level({ available: -2 }), level({ available: 5 })];
    expect(totalAvailable(levels)).toBe(13);
  });

  it('vale 0 su lista vuota', () => {
    expect(totalAvailable([])).toBe(0);
  });
});

describe('sumInventoryQuantities', () => {
  it('somma stato per stato', () => {
    const levels = [
      level({ onHand: 10, available: 8, committed: 2, incoming: 5, reserved: 1 }),
      level({ onHand: 4, available: 4, committed: 0, incoming: 0, reserved: 0 }),
    ];
    expect(sumInventoryQuantities(levels)).toEqual({
      onHand: 14,
      available: 12,
      committed: 2,
      incoming: 5,
      reserved: 1,
    });
  });
});
