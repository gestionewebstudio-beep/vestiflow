import 'reflect-metadata';

import {
  SalesOrderFinancialStatus as PrismaFinancial,
  SalesOrderFulfillmentStatus as PrismaFulfillment,
  SalesOrderSource as PrismaSource,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  API_SOURCE_ONLINE,
  API_SOURCE_POS,
  financialStatusDisplayLabel,
  fromPrismaFinancial,
  fromPrismaFulfillment,
  fromPrismaSource,
  fulfillmentStatusDisplayLabel,
  prismaFinancialFilter,
  sourceDisplayLabel,
  toPrismaSource,
} from './sales-order.enum-mapper';

describe('sales-order.enum-mapper', () => {
  describe('toPrismaSource e fromPrismaSource', () => {
    it('mappa online e pos', () => {
      expect(toPrismaSource(API_SOURCE_ONLINE)).toBe(PrismaSource.shopify_online);
      expect(toPrismaSource(API_SOURCE_POS)).toBe(PrismaSource.shopify_pos);
      expect(toPrismaSource('unknown')).toBeUndefined();
      expect(fromPrismaSource(PrismaSource.shopify_pos)).toBe(API_SOURCE_POS);
      expect(fromPrismaSource(PrismaSource.shopify_online)).toBe(API_SOURCE_ONLINE);
    });
  });

  describe('prismaFinancialFilter', () => {
    it('pending include authorized', () => {
      expect(prismaFinancialFilter('pending')).toEqual([
        PrismaFinancial.pending,
        PrismaFinancial.authorized,
      ]);
    });

    it('ritorna undefined per filtro sconosciuto', () => {
      expect(prismaFinancialFilter('invalid')).toBeUndefined();
    });
  });

  describe('fromPrismaFinancial', () => {
    for (const [prisma, api] of [
      [PrismaFinancial.paid, 'paid'],
      [PrismaFinancial.partially_refunded, 'partially_refunded'],
      [PrismaFinancial.refunded, 'refunded'],
      [PrismaFinancial.voided, 'voided'],
      [PrismaFinancial.pending, 'pending'],
      [PrismaFinancial.authorized, 'pending'],
    ] as const) {
      it(`mappa ${prisma} -> ${api}`, () => {
        expect(fromPrismaFinancial(prisma)).toBe(api);
      });
    }
  });

  describe('fromPrismaFulfillment', () => {
    it('mappa stati evasione', () => {
      expect(fromPrismaFulfillment(PrismaFulfillment.fulfilled)).toBe('fulfilled');
      expect(fromPrismaFulfillment(PrismaFulfillment.partially_fulfilled)).toBe('partial');
      expect(fromPrismaFulfillment(PrismaFulfillment.unfulfilled)).toBe('unfulfilled');
    });
  });

  describe('display labels', () => {
    it('sourceDisplayLabel', () => {
      expect(sourceDisplayLabel(PrismaSource.shopify_online)).toBe('Online');
      expect(sourceDisplayLabel(PrismaSource.shopify_pos)).toBe('Negozio');
    });

    it('financialStatusDisplayLabel copre tutti gli stati', () => {
      expect(financialStatusDisplayLabel(PrismaFinancial.paid)).toBe('Pagato');
      expect(financialStatusDisplayLabel(PrismaFinancial.pending)).toBe('In attesa');
      expect(financialStatusDisplayLabel(PrismaFinancial.authorized)).toBe('In attesa');
    });

    it('fulfillmentStatusDisplayLabel copre tutti gli stati', () => {
      expect(fulfillmentStatusDisplayLabel(PrismaFulfillment.unfulfilled)).toBe('Da evadere');
      expect(fulfillmentStatusDisplayLabel(PrismaFulfillment.partially_fulfilled)).toBe(
        'Evasione parziale',
      );
      expect(fulfillmentStatusDisplayLabel(PrismaFulfillment.fulfilled)).toBe('Evaso');
    });
  });
});
