import { detectBarcodeFormat } from '@core/utils/barcode.util';
import { formatMoney } from '@core/utils/money.util';

import {
  PRODUCT_LABEL_BARCODE,
  PRODUCT_LABEL_LAYOUT,
  PRODUCT_LABEL_PRINT_FONTS,
} from './product-label.constants';
import type { ProductLabelViewModel } from './product-label.model';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function renderBarcodeSvg(documentRef: Document, value: string): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const { default: JsBarcode } = await import('jsbarcode');
  const svg = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const options = {
    displayValue: false,
    margin: 0,
    height: PRODUCT_LABEL_BARCODE.height,
    width: PRODUCT_LABEL_BARCODE.width,
  };

  try {
    JsBarcode(svg, trimmed, { ...options, format: detectBarcodeFormat(trimmed) });
  } catch {
    try {
      JsBarcode(svg, trimmed, { ...options, format: 'CODE128' });
    } catch {
      return '';
    }
  }

  return svg.outerHTML;
}

function renderLabelHtml(label: ProductLabelViewModel, barcodeSvg: string): string {
  const compareAtHtml = label.compareAtPrice
    ? `<span class="label__compare-at">${escapeHtml(formatMoney(label.compareAtPrice))}</span>`
    : '';

  const barcodeBlock = label.barcode
    ? `<div class="label__barcode-block">${barcodeSvg}<p class="label__barcode">${escapeHtml(label.barcode)}</p></div>`
    : `<p class="label__barcode-missing">Barcode non impostato</p>`;

  return `<article class="label">
  <p class="label__name">${escapeHtml(label.productName)}</p>
  <p class="label__brand">${escapeHtml(label.brand)}</p>
  <p class="label__sku"><span class="label__sku-label">SKU</span> <span class="label__sku-value">${escapeHtml(label.sku)}</span></p>
  ${barcodeBlock}
  <div class="label__prices">${compareAtHtml}<span class="label__price">${escapeHtml(formatMoney(label.sellingPrice))}</span></div>
</article>`;
}

const LABEL_PRINT_STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #fff;
    color: #000;
  }
  .sheet {
    display: flex;
    flex-wrap: wrap;
    gap: ${PRODUCT_LABEL_LAYOUT.sheetGapMm}mm;
    padding: ${PRODUCT_LABEL_LAYOUT.sheetPaddingMm}mm;
  }
  .label {
    width: ${PRODUCT_LABEL_LAYOUT.widthMm}mm;
    min-height: ${PRODUCT_LABEL_LAYOUT.minHeightMm}mm;
    padding: ${PRODUCT_LABEL_LAYOUT.paddingMm}mm;
    background: #fff;
    color: #000;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .label__name {
    margin: 0;
    font-size: ${PRODUCT_LABEL_PRINT_FONTS.namePt}pt;
    font-weight: 600;
    line-height: 1.15;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .label__brand {
    margin: 1mm 0 0;
    font-size: ${PRODUCT_LABEL_PRINT_FONTS.bodyPt}pt;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .label__sku {
    margin: 1.5mm 0 0;
    font-size: ${PRODUCT_LABEL_PRINT_FONTS.bodyPt}pt;
  }
  .label__sku-label { font-weight: 600; }
  .label__barcode-block { margin-top: 1.5mm; }
  .label__barcode {
    margin: 1mm 0 0;
    font-size: ${PRODUCT_LABEL_PRINT_FONTS.bodyPt}pt;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .label__barcode-missing {
    margin: 1.5mm 0 0;
    font-size: ${PRODUCT_LABEL_PRINT_FONTS.bodyPt}pt;
    color: #666;
  }
  .label__prices {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2mm;
    margin-top: 1.5mm;
  }
  .label__compare-at {
    font-size: ${PRODUCT_LABEL_PRINT_FONTS.comparePt}pt;
    color: #666;
    text-decoration: line-through;
    font-variant-numeric: tabular-nums;
  }
  .label__price {
    font-size: ${PRODUCT_LABEL_PRINT_FONTS.pricePt}pt;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  svg { display: block; width: 100%; height: auto; }
  @page { margin: ${PRODUCT_LABEL_LAYOUT.pageMarginMm}mm; }
`;

/** Documento HTML completo per la stampa diretta (iframe/popup). */
export async function buildLabelPrintDocument(
  labels: readonly ProductLabelViewModel[],
  documentRef: Document,
): Promise<string> {
  const labelBlocks: string[] = [];

  for (const label of labels) {
    const barcodeSvg = await renderBarcodeSvg(documentRef, label.barcode);
    labelBlocks.push(renderLabelHtml(label, barcodeSvg));
  }

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <title>Stampa etichette</title>
    <style>${LABEL_PRINT_STYLES}</style>
  </head>
  <body>
    <div class="sheet">${labelBlocks.join('')}</div>
  </body>
</html>`;
}
