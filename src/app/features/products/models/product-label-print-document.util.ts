import { detectBarcodeFormat } from '@core/utils/barcode.util';
import { formatMoney } from '@core/utils/money.util';

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
    height: 40,
    width: 1.8,
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
    gap: 8mm;
    padding: 8mm;
  }
  .label {
    width: 62mm;
    min-height: 40mm;
    padding: 4mm;
    background: #fff;
    color: #000;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .label__name {
    margin: 0;
    font-size: 11pt;
    font-weight: 600;
    line-height: 1.2;
  }
  .label__brand {
    margin: 2mm 0 0;
    font-size: 9pt;
  }
  .label__sku {
    margin: 3mm 0 0;
    font-size: 9pt;
  }
  .label__sku-label { font-weight: 600; }
  .label__barcode-block { margin-top: 3mm; }
  .label__barcode {
    margin: 2mm 0 0;
    font-size: 9pt;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .label__barcode-missing {
    margin: 3mm 0 0;
    font-size: 9pt;
    color: #666;
  }
  .label__prices {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 3mm;
    margin-top: 3mm;
  }
  .label__compare-at {
    font-size: 10pt;
    color: #666;
    text-decoration: line-through;
    font-variant-numeric: tabular-nums;
  }
  .label__price {
    font-size: 14pt;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  svg { display: block; width: 100%; height: auto; }
  @page { margin: 8mm; }
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
