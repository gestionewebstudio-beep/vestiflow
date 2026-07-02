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
  readonly defaultVatRatePercent: number;
}

export type TenantFeatureSettingsDto = TenantFeatureSettings;

export type UpdateTenantFeatureSettingsBody = Partial<TenantFeatureSettings>;
