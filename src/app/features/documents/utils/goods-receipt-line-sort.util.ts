// Quali colonne dell'Arrivo merce si possono ordinare, e nient'altro.
// Il CONFRONTO vive in domain/documents/utils/document-line-sort.util: qui
// c'era anche quello, ed era la copia che le altre maschere non potevano usare.

export type GoodsReceiptLineSortColumn =
  'sku' | 'barcode' | 'supplierCode' | 'product' | 'quantity' | 'unitCost' | 'vat';

export const GOODS_RECEIPT_SORTABLE_LINE_COLUMNS: readonly GoodsReceiptLineSortColumn[] = [
  'sku',
  'barcode',
  'supplierCode',
  'product',
  'quantity',
  'unitCost',
  'vat',
];
