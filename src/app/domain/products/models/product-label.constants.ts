/** Formato etichetta cassa (~50×30 mm, rotoli termici compatti). */
export const PRODUCT_LABEL_LAYOUT = {
  widthMm: 50,
  minHeightMm: 30,
  paddingMm: 2,
  sheetGapMm: 4,
  sheetPaddingMm: 4,
  pageMarginMm: 4,
} as const;

export const PRODUCT_LABEL_BARCODE = {
  height: 26,
  width: 1.5,
} as const;

/** Tipografia stampa diretta (pt). */
export const PRODUCT_LABEL_PRINT_FONTS = {
  namePt: 8,
  bodyPt: 7,
  pricePt: 10,
  comparePt: 7,
} as const;
