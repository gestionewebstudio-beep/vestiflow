import type {
  ProductImportPreview,
  ProductImportPreviewItem,
  ProductImportResult,
} from '../models/product-import.model';

interface ImportPreviewApiRow {
  readonly handle: string;
  readonly dto: { readonly name: string; readonly variants: readonly unknown[] };
  readonly issues: readonly {
    readonly level: 'error' | 'warning';
    readonly message: string;
    readonly rowNumber?: number;
  }[];
  readonly rowNumbers: readonly number[];
}

export interface ImportPreviewApiResponse {
  readonly products: readonly ImportPreviewApiRow[];
  readonly summary: ProductImportPreview['summary'];
}

export function mapProductImportPreview(response: ImportPreviewApiResponse): ProductImportPreview {
  return {
    summary: response.summary,
    products: response.products.map(mapPreviewItem),
  };
}

function mapPreviewItem(row: ImportPreviewApiRow): ProductImportPreviewItem {
  const hasError = row.issues.some((issue) => issue.level === 'error');
  const hasWarning = row.issues.some((issue) => issue.level === 'warning');
  return {
    handle: row.handle,
    name: row.dto.name,
    variantCount: row.dto.variants.length,
    status: hasError ? 'error' : hasWarning ? 'warning' : 'ready',
    issues: row.issues,
    rowNumbers: row.rowNumbers,
  };
}

export function mapProductImportResult(response: ProductImportResult): ProductImportResult {
  return response;
}
