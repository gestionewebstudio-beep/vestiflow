export interface ShopifyShopChangeBlockerDto {
  readonly code: 'supplier_orders_open';
  readonly message: string;
  readonly references: readonly {
    readonly type: 'supplier_order';
    readonly id: string;
    readonly reference: string;
  }[];
}

export interface ShopifyShopChangePreviewDto {
  readonly currentShopDomain: string | null;
  readonly counts: {
    readonly shopifyProducts: number;
    readonly shopifyVariants: number;
    readonly shopifyCustomers: number;
    readonly shopifySalesOrders: number;
    readonly inventoryLevels: number;
    readonly stockMovements: number;
    readonly shopifyLinkedLocations: number;
    readonly removableShopifyLocations: number;
  };
  readonly blockers: readonly ShopifyShopChangeBlockerDto[];
}

export interface PurgeShopifyDataRequestDto {
  readonly confirmShopDomain: string;
  readonly purgeCatalog: boolean;
  readonly purgeCustomers: boolean;
  readonly purgeOrders: boolean;
}

export interface ShopifyShopChangePurgeResultDto {
  readonly purged: {
    readonly products: number;
    readonly customers: number;
    readonly salesOrders: number;
    readonly stockMovements: number;
    readonly inventoryLevels: number;
    readonly inventoryCountLines: number;
    readonly locations: number;
  };
}
