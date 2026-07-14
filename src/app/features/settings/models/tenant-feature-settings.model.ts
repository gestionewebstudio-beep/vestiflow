import type { PurchaseCostEntryMode } from '@core/models/vat-code.model';

export type SupplierPriceUpdatePolicy = 'always' | 'ask' | 'never';

export interface TenantFeatureSettings {
  readonly lotsEnabled: boolean;
  readonly serialsEnabled: boolean;
  readonly variantsEnabled: boolean;
  readonly barcodeScannerEnabled: boolean;
  readonly supplierOrdersEnabled: boolean;
  readonly goodsReceiptEnabled: boolean;
  readonly warehouseValuationEnabled: boolean;
  readonly updateSupplierPriceOnLoad: SupplierPriceUpdatePolicy;
  readonly allowNegativeInventory: boolean;
  readonly warnNegativeInventory: boolean;
  readonly blockNegativeInventory: boolean;
  readonly defaultUnitOfMeasure: string;
  readonly defaultVatCodeId: string | null;
  readonly defaultPurchaseCostEntryMode: PurchaseCostEntryMode;
}

export type UpdateTenantFeatureSettingsBody = Partial<TenantFeatureSettings>;
