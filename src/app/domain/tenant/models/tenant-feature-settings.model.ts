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
  /**
   * Listini aggiuntivi (§B): tre posizioni fisse. Nome `null` = etichetta di
   * default (Listino 1/2/3). L'anagrafica mostra solo quelli attivi.
   */
  readonly listino1Name: string | null;
  readonly listino1Active: boolean;
  readonly listino2Name: string | null;
  readonly listino2Active: boolean;
  readonly listino3Name: string | null;
  readonly listino3Active: boolean;
}

export type UpdateTenantFeatureSettingsBody = Partial<TenantFeatureSettings>;
