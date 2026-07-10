import { parseMoneyInput } from '@core/utils/money.util';

export type GoodsReceiptLineSortColumn =
  | 'sku'
  | 'barcode'
  | 'supplierCode'
  | 'product'
  | 'quantity'
  | 'unitCost'
  | 'vat';

export const GOODS_RECEIPT_SORTABLE_LINE_COLUMNS: readonly GoodsReceiptLineSortColumn[] = [
  'sku',
  'barcode',
  'supplierCode',
  'product',
  'quantity',
  'unitCost',
  'vat',
];

export interface GoodsReceiptLineSortValues {
  readonly sku: string;
  readonly barcode: string;
  readonly supplierSku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitCost: string;
  readonly vatRatePercent: string;
}

export function compareGoodsReceiptLines(
  left: GoodsReceiptLineSortValues,
  right: GoodsReceiptLineSortValues,
  column: GoodsReceiptLineSortColumn,
  currencyCode: string,
): number {
  switch (column) {
    case 'quantity': {
      return left.quantity - right.quantity;
    }
    case 'unitCost': {
      const leftMinor = parseMoneyInput(left.unitCost, currencyCode)?.amountMinor ?? -1;
      const rightMinor = parseMoneyInput(right.unitCost, currencyCode)?.amountMinor ?? -1;
      return leftMinor - rightMinor;
    }
    case 'vat': {
      const leftVat = Number.parseFloat(left.vatRatePercent) || 0;
      const rightVat = Number.parseFloat(right.vatRatePercent) || 0;
      return leftVat - rightVat;
    }
    case 'sku':
      return left.sku.localeCompare(right.sku, 'it', { sensitivity: 'base' });
    case 'barcode':
      return left.barcode.localeCompare(right.barcode, 'it', { sensitivity: 'base' });
    case 'supplierCode':
      return left.supplierSku.localeCompare(right.supplierSku, 'it', { sensitivity: 'base' });
    case 'product':
      return left.productName.localeCompare(right.productName, 'it', { sensitivity: 'base' });
    default:
      return 0;
  }
}
