export interface InventoryImportPreviewItem {
  readonly key: string;
  readonly rowNumber: number;
  readonly variantTitle: string;
  readonly sku: string;
  readonly locationName: string;
  readonly currentAvailable: number | null;
  readonly newAvailable: number | null;
  readonly delta: number | null;
  readonly status: 'ready' | 'unchanged' | 'error';
  readonly message?: string;
}

export interface InventoryImportPreview {
  readonly rows: readonly InventoryImportPreviewItem[];
  readonly summary: {
    readonly total: number;
    readonly ready: number;
    readonly unchanged: number;
    readonly errors: number;
  };
}

export interface InventoryImportResultItem {
  readonly key: string;
  readonly sku: string;
  readonly locationName: string;
  readonly status: 'updated' | 'unchanged' | 'skipped' | 'failed';
  readonly message?: string;
}

export interface InventoryImportResult {
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly failed: number;
  readonly rows: readonly InventoryImportResultItem[];
}

export interface InventoryExportQuery {
  readonly locationId?: string;
  readonly search?: string;
  readonly stockStatus?: string;
}

/** Filtri export corrispettivi (vendite/storni in un periodo). */
export interface CorrispettiviExportQuery {
  readonly locationId?: string;
  /** Canale: origine movimento (es. vestiflow_pos, vestiflow_online). */
  readonly origin?: string;
  readonly from?: string;
  readonly to?: string;
}
