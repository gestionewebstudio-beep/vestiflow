import { describe, expect, it } from 'vitest';

import { StockStatus } from '@core/models/inventory-level.model';
import { StockMovementType } from '@core/models/stock-movement.model';

import {
  movementActorLabel,
  movementTypeLabel,
  movementTypeTone,
  stockStatusLabel,
  stockStatusTone,
} from './inventory-labels.util';

describe('inventory-labels.util', () => {
  describe('stockStatusLabel e stockStatusTone', () => {
    for (const status of Object.values(StockStatus)) {
      it(`copre StockStatus.${status}`, () => {
        expect(stockStatusLabel(status)).toBeTruthy();
        expect(stockStatusTone(status)).toBeTruthy();
      });
    }
  });

  describe('movementTypeLabel e movementTypeTone', () => {
    for (const type of Object.values(StockMovementType)) {
      it(`copre StockMovementType.${type}`, () => {
        expect(movementTypeLabel(type)).toBeTruthy();
        expect(movementTypeTone(type)).toBeTruthy();
      });
    }
  });

  describe('movementActorLabel', () => {
    it('mappa attori noti e fallback', () => {
      expect(movementActorLabel('API')).toBe('Automatico');
      expect(movementActorLabel('Shopify')).toBe('Shopify');
      expect(movementActorLabel('Mario Rossi')).toBe('Mario Rossi');
      expect(movementActorLabel('')).toBe('—');
    });
  });
});
