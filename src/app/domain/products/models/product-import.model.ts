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
  /** Già presente in catalogo: verrà saltato all'import. */
  readonly alreadyImported: boolean;
}

export interface ProductImportPreview {
  readonly products: readonly ProductImportPreviewItem[];
  readonly summary: {
    readonly total: number;
    readonly ready: number;
    readonly warnings: number;
    readonly errors: number;
    readonly alreadyImported: number;
  };
}

export interface ProductImportResultItem {
  readonly handle: string;
  readonly productId?: string;
  readonly name: string;
  readonly status: 'imported' | 'skipped' | 'failed';
  readonly message?: string;
  /** Codice articolo assegnato al prodotto importato (§IMPORTAZIONI MASSIVE). */
  readonly articleCode?: string;
  /** true = progressivo generato automaticamente (assente nel file). */
  readonly articleCodeGenerated?: boolean;
}

export interface ProductImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  /** Quanti codici articolo sono stati generati automaticamente. */
  readonly articleCodesGenerated: number;
  readonly products: readonly ProductImportResultItem[];
}
