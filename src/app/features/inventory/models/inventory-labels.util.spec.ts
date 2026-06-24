import { describe, expect, it } from 'vitest';

import { StockStatus } from '@core/models/inventory-level.model';
import { MovementOrigin, StockMovementType } from '@core/models/stock-movement.model';

import {
  movementActorLabel,
  movementOriginLabel,
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

  describe('movementOriginLabel', () => {
    it('copre tutte le origini movimento', () => {
      expect(movementOriginLabel(MovementOrigin.Manual)).toBe('Gestionale');
      expect(movementOriginLabel(MovementOrigin.Shopify)).toBe('Shopify');
      expect(movementOriginLabel(MovementOrigin.Tiktok)).toBe('TikTok');
      expect(movementOriginLabel(MovementOrigin.VestiflowPos)).toBe('Vendita negozio');
    });

    it('restituisce trattino se origine assente', () => {
      expect(movementOriginLabel(undefined)).toBe('—');
    });
  });
});
