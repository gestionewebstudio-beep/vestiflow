export type BarcodeFormat = 'EAN13' | 'EAN8' | 'UPC' | 'CODE128';

/** Formato JsBarcode più adatto al valore (EAN/UPC numerici, altrimenti Code 128). */
export function detectBarcodeFormat(value: string): BarcodeFormat {
  const trimmed = value.trim();
  if (/^\d{13}$/.test(trimmed)) {
    return 'EAN13';
  }
  if (/^\d{12}$/.test(trimmed)) {
    return 'UPC';
  }
  if (/^\d{8}$/.test(trimmed)) {
    return 'EAN8';
  }
  return 'CODE128';
}
