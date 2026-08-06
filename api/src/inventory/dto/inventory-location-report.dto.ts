export interface InventoryLocationReportRowDto {
  readonly locationId: string;
  readonly locationName: string;
  readonly trackedVariants: number;
  readonly availableUnits: number;
  readonly lowStockCount: number;
  readonly stockValueMinor: number;
  readonly currencyCode: string;
}
