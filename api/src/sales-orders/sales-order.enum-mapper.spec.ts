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

  describe('display labels', () => {
    it('sourceDisplayLabel', () => {
      // ⚠️ «Online» e «Negozio» erano ambigue e si scambiavano il posto:
      // «Negozio» era il negozio di SHOPIFY, non quello di VestiFlow. Ora ogni
      // etichetta nomina la sorgente vera (`11` A6).
      expect(sourceDisplayLabel(PrismaSource.shopify_online)).toBe('Online');
      expect(sourceDisplayLabel(PrismaSource.shopify_pos)).toBe('Shopify POS');
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

    // ⚠ GUARDIA — registro difetti 1.8.
    // Prima queste due funzioni chiudevano con «altrimenti online». Quando al canale si e'
    // aggiunto `store`, quel ramo se lo sarebbe preso in silenzio, e uno scontrino di cassa
    // sarebbe comparso come vendita online: non un vuoto, una bugia. Ora sono `switch`
    // esaustivi senza ramo predefinito, quindi il prossimo valore nuovo lo dice il
    // compilatore — questi test lo dicono a chi legge.
    it('la cassa ha la sua etichetta, e non finisce nel ramo dell online', () => {
      expect(sourceDisplayLabel(PrismaSource.store)).toBe('Vendita al banco');
      expect(fromPrismaSource(PrismaSource.store)).toBe('store');
    });

    it('ogni valore del canale ha una traduzione propria, nessuno condiviso per difetto', () => {
      const etichette = Object.values(PrismaSource).map((source) => sourceDisplayLabel(source));
      // Se due valori diversi dessero la stessa etichetta, uno starebbe usando il ramo
      // dell'altro — che e' esattamente il difetto che questa guardia impedisce.
      expect(new Set(etichette).size).toBe(Object.values(PrismaSource).length);
    });
  });
});
