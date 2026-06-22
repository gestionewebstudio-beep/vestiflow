import { describe, expect, it } from 'vitest';

import { SupplierOrderStatus } from '@core/models/supplier-order.model';

import { supplierOrderStatusLabel, supplierOrderStatusTone } from './supplier-order-labels.util';

describe('supplier-order-labels.util', () => {
  for (const status of Object.values(SupplierOrderStatus)) {
    it(`copre SupplierOrderStatus.${status}`, () => {
      expect(supplierOrderStatusLabel(status)).toBeTruthy();
      expect(supplierOrderStatusTone(status)).toBeTruthy();
    });
  }
});
