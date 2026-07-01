export const InventoryTrackingMode = {
  None: 'none',
  Standard: 'standard',
  Lot: 'lot',
  Serial: 'serial',
} as const;

export type InventoryTrackingMode =
  (typeof InventoryTrackingMode)[keyof typeof InventoryTrackingMode];

export const INVENTORY_TRACKING_LABELS: Readonly<Record<InventoryTrackingMode, string>> = {
  [InventoryTrackingMode.None]: 'Nessuno',
  [InventoryTrackingMode.Standard]: 'Standard',
  [InventoryTrackingMode.Lot]: 'Lotti',
  [InventoryTrackingMode.Serial]: 'Seriali',
};

export const COMMON_UNIT_OF_MEASURE = ['pz', 'conf', 'kg', 'g', 'lt', 'm'] as const;

export const COMMON_VAT_RATES = [22, 10, 4, 0] as const;
