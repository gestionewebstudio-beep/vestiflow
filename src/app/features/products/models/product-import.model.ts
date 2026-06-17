export type ProductImportIssueLevel = 'error' | 'warning';

export interface ProductImportIssue {
  readonly level: ProductImportIssueLevel;
  readonly message: string;
  readonly rowNumber?: number;
}

export interface ProductImportPreviewItem {
  readonly handle: string;
  readonly name: string;
  readonly variantCount: number;
  readonly status: 'ready' | 'warning' | 'error';
  readonly issues: readonly ProductImportIssue[];
  readonly rowNumbers: readonly number[];
}

export interface ProductImportPreview {
  readonly products: readonly ProductImportPreviewItem[];
  readonly summary: {
    readonly total: number;
    readonly ready: number;
    readonly warnings: number;
    readonly errors: number;
  };
}

export interface ProductImportResultItem {
  readonly handle: string;
  readonly productId?: string;
  readonly name: string;
  readonly status: 'imported' | 'skipped' | 'failed';
  readonly message?: string;
}

export interface ProductImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly products: readonly ProductImportResultItem[];
}
