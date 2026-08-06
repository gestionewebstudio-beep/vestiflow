import type { PdfDocumentInstance } from './pdf-document.types';

const ROME_DATE_FORMAT = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatRomeDate(value: Date): string {
  return ROME_DATE_FORMAT.format(value);
}

export interface PdfTableColumn {
  readonly header: string;
  readonly width: number;
  readonly align?: 'left' | 'right' | 'center';
}

export interface PdfTableDrawOptions {
  readonly doc: PdfDocumentInstance;
  readonly x: number;
  readonly y: number;
  readonly pageWidth: number;
  readonly columns: readonly PdfTableColumn[];
  readonly rows: readonly (readonly string[])[];
  readonly headerFill?: string;
  readonly fontSize?: number;
}

const DEFAULT_HEADER_FILL = '#f0f0f0';
const ROW_PADDING = 4;
const MIN_ROW_HEIGHT = 16;

/** Disegna tabella con header ripetuto su nuove pagine. Restituisce la Y finale. */
export function drawPdfTable(options: PdfTableDrawOptions): number {
  const {
    doc,
    x,
    y: startY,
    pageWidth,
    columns,
    rows,
    headerFill = DEFAULT_HEADER_FILL,
    fontSize = 8,
  } = options;

  const bottomMargin = doc.page.margins.bottom;
  const pageBottom = doc.page.height - bottomMargin;
  let y = startY;

  const drawHeader = (): void => {
    let cellX = x;
    doc.font('Helvetica-Bold').fontSize(fontSize);
    const headerHeight = MIN_ROW_HEIGHT + ROW_PADDING;
    doc.rect(x, y, pageWidth, headerHeight).fill(headerFill);
    doc.fillColor('#000000');

    for (const column of columns) {
      doc.text(column.header, cellX + ROW_PADDING, y + ROW_PADDING, {
        width: column.width - ROW_PADDING * 2,
        align: column.align ?? 'left',
        lineBreak: false,
      });
      cellX += column.width;
    }
    y += headerHeight;
  };

  const ensureSpace = (rowHeight: number): void => {
    if (y + rowHeight <= pageBottom) {
      return;
    }
    doc.addPage();
    y = doc.page.margins.top;
    drawHeader();
  };

  drawHeader();
  doc.font('Helvetica').fontSize(fontSize);

  for (const row of rows) {
    let maxCellHeight = MIN_ROW_HEIGHT;
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      if (!column) {
        continue;
      }
      const value = row[index] ?? '';
      const textHeight = doc.heightOfString(value, {
        width: column.width - ROW_PADDING * 2,
        align: column.align ?? 'left',
      });
      maxCellHeight = Math.max(maxCellHeight, textHeight);
    }
    const rowHeight = maxCellHeight + ROW_PADDING * 2;
    ensureSpace(rowHeight);

    let cellX = x;
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      if (!column) {
        continue;
      }
      const value = row[index] ?? '';
      doc.text(value, cellX + ROW_PADDING, y + ROW_PADDING, {
        width: column.width - ROW_PADDING * 2,
        align: column.align ?? 'left',
      });
      cellX += column.width;
    }

    doc
      .moveTo(x, y + rowHeight)
      .lineTo(x + pageWidth, y + rowHeight)
      .strokeColor('#dddddd')
      .lineWidth(0.5)
      .stroke();

    y += rowHeight;
  }

  return y;
}

export function drawPdfSectionTitle(doc: PdfDocumentInstance, title: string, y: number): number {
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000').text(title, doc.page.margins.left, y);
  return y + 18;
}

export function drawPdfMetaLine(doc: PdfDocumentInstance, label: string, value: string, y: number): number {
  doc.font('Helvetica').fontSize(10).fillColor('#333333');
  doc.text(`${label}: ${value}`, doc.page.margins.left, y);
  return y + 14;
}

export function drawPdfTotals(
  doc: PdfDocumentInstance,
  totals: readonly { readonly label: string; readonly value: string; readonly bold?: boolean }[],
  y: number,
): number {
  const labelX = doc.page.width - doc.page.margins.right - 180;
  const valueX = doc.page.width - doc.page.margins.right - 80;
  let currentY = y + 8;

  for (const row of totals) {
    doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(row.bold ? 11 : 10);
    doc.text(row.label, labelX, currentY, { width: 90, align: 'right' });
    doc.text(row.value, valueX, currentY, { width: 80, align: 'right' });
    currentY += row.bold ? 18 : 14;
  }

  return currentY;
}
