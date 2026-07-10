/** Riga parsata da CSV/Excel (export testuale) per import nel form arrivo merce. */
export interface GoodsReceiptCsvLine {
  readonly rowNumber: number;
  readonly sku: string;
  readonly barcode: string;
  readonly supplierSku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitCostText: string;
  readonly vatRatePercentText: string;
}

export class GoodsReceiptCsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoodsReceiptCsvParseError';
  }
}

const HEADER_ALIASES: Record<string, keyof Omit<GoodsReceiptCsvLine, 'rowNumber'>> = {
  sku: 'sku',
  codice: 'sku',
  'codice articolo': 'sku',
  'codice sku': 'sku',
  barcode: 'barcode',
  ean: 'barcode',
  ean13: 'barcode',
  gtin: 'barcode',
  'codice fornitore': 'supplierSku',
  'cod. fornitore': 'supplierSku',
  suppliercode: 'supplierSku',
  'supplier sku': 'supplierSku',
  suppliersku: 'supplierSku',
  quantity: 'quantity',
  qty: 'quantity',
  quantita: 'quantity',
  quantità: 'quantity',
  'q.tà': 'quantity',
  qta: 'quantity',
  costo: 'unitCostText',
  'prezzo acquisto': 'unitCostText',
  'prezzo di acquisto': 'unitCostText',
  'unit cost': 'unitCostText',
  unitcost: 'unitCostText',
  cost: 'unitCostText',
  iva: 'vatRatePercentText',
  'aliquota iva': 'vatRatePercentText',
  vat: 'vatRatePercentText',
  nome: 'productName',
  'nome prodotto': 'productName',
  prodotto: 'productName',
  descrizione: 'productName',
  description: 'productName',
};

/** Parser CSV RFC4180 minimale (virgola o punto e virgola). */
export function parseCsvText(content: string): string[][] {
  const delimiter = detectCsvDelimiter(content);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function detectCsvDelimiter(content: string): ',' | ';' {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseQuantity(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new GoodsReceiptCsvParseError(`Quantità non valida: "${value.trim()}"`);
  }
  return parsed;
}

export function parseGoodsReceiptLinesCsv(content: string): readonly GoodsReceiptCsvLine[] {
  const matrix = parseCsvText(content.replace(/^\uFEFF/, ''));
  const nonEmpty = matrix.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (nonEmpty.length === 0) {
    throw new GoodsReceiptCsvParseError('Il file CSV è vuoto.');
  }

  const [headerRow, ...dataRows] = nonEmpty;
  if (!headerRow) {
    throw new GoodsReceiptCsvParseError('Il file CSV è vuoto.');
  }
  const columnIndex = new Map<keyof Omit<GoodsReceiptCsvLine, 'rowNumber'>, number>();
  headerRow.forEach((header, index) => {
    const key = HEADER_ALIASES[normalizeHeader(header)];
    if (key && !columnIndex.has(key)) {
      columnIndex.set(key, index);
    }
  });

  if (!columnIndex.has('sku') && !columnIndex.has('barcode') && !columnIndex.has('supplierSku')) {
    throw new GoodsReceiptCsvParseError(
      'Intestazioni obbligatorie mancanti: serve almeno SKU, EAN o codice fornitore.',
    );
  }
  if (!columnIndex.has('quantity')) {
    throw new GoodsReceiptCsvParseError(
      'Intestazione obbligatoria mancante: quantità (quantity / q.tà).',
    );
  }

  const lines: GoodsReceiptCsvLine[] = [];
  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const read = (key: keyof Omit<GoodsReceiptCsvLine, 'rowNumber'>): string => {
      const col = columnIndex.get(key);
      return col == null ? '' : (row[col] ?? '').trim();
    };

    const sku = read('sku');
    const barcode = read('barcode');
    const supplierSku = read('supplierSku');
    const productName = read('productName');
    const quantityRaw = read('quantity');
    if (!sku && !barcode && !productName && !quantityRaw && !supplierSku) {
      return;
    }
    if (!sku && !barcode && !supplierSku) {
      throw new GoodsReceiptCsvParseError(
        `Riga ${rowNumber}: inserisci SKU, EAN o codice fornitore per ogni riga importabile.`,
      );
    }

    lines.push({
      rowNumber,
      sku,
      barcode,
      supplierSku,
      productName,
      quantity: parseQuantity(quantityRaw),
      unitCostText: read('unitCostText'),
      vatRatePercentText: read('vatRatePercentText'),
    });
  });

  if (lines.length === 0) {
    throw new GoodsReceiptCsvParseError('Nessuna riga valida trovata nel file CSV.');
  }

  return lines;
}
