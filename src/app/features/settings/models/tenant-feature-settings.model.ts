export interface TenantFeatureSettings {
  readonly lotsEnabled: boolean;
  readonly serialsEnabled: boolean;
  readonly variantsEnabled: boolean;
  readonly barcodeScannerEnabled: boolean;
  readonly supplierOrdersEnabled: boolean;
  readonly goodsReceiptEnabled: boolean;
  readonly warehouseValuationEnabled: boolean;
  readonly allowNegativeInventory: boolean;
  readonly warnNegativeInventory: boolean;
  readonly blockNegativeInventory: boolean;
  readonly defaultUnitOfMeasure: string;
  readonly defaultVatCodeId: string | null;
}

export type UpdateTenantFeatureSettingsBody = Partial<TenantFeatureSettings>;
