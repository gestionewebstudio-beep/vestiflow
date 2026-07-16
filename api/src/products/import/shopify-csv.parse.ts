/** Riga normalizzata dal CSV prodotti Shopify. */
export interface ShopifyCsvRow {
  readonly rowNumber: number;
  /**
   * Codice articolo VestiFlow (colonna opzionale, NON Shopify): se presente
   * e valido viene usato, se assente il progressivo viene generato, se già
   * in uso la riga viene segnalata nel report (§IMPORTAZIONI MASSIVE).
   */
  readonly articleCode: string;
  readonly handle: string;
  readonly title: string;
  readonly bodyHtml: string;
  readonly vendor: string;
  readonly type: string;
  readonly tags: string;
  readonly published: string;
  readonly option1Name: string;
  readonly option1Value: string;
  readonly option2Name: string;
  readonly option2Value: string;
  readonly option3Name: string;
  readonly option3Value: string;
  readonly variantSku: string;
  readonly variantPrice: string;
  readonly variantCompareAtPrice: string;
  readonly variantBarcode: string;
  readonly imageSrc: string;
  readonly imageAltText: string;
  readonly imagePosition: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
}

const HEADER_ALIASES: Record<string, keyof Omit<ShopifyCsvRow, 'rowNumber'>> = {
  'codice articolo': 'articleCode',
  'article code': 'articleCode',
  handle: 'handle',
  title: 'title',
  'body (html)': 'bodyHtml',
  vendor: 'vendor',
  type: 'type',
  tags: 'tags',
  published: 'published',
  'option1 name': 'option1Name',
  'option1 value': 'option1Value',
  'option2 name': 'option2Name',
  'option2 value': 'option2Value',
  'option3 name': 'option3Name',
  'option3 value': 'option3Value',
  'variant sku': 'variantSku',
  'variant price': 'variantPrice',
  'variant compare-at price': 'variantCompareAtPrice',
  'variant compare at price': 'variantCompareAtPrice',
  'variant barcode': 'variantBarcode',
  'image src': 'imageSrc',
  'image alt text': 'imageAltText',
  'image position': 'imagePosition',
  'seo title': 'seoTitle',
  'seo description': 'seoDescription',
};

export class ShopifyCsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopifyCsvParseError';
  }
}

/** Parser CSV RFC4180 minimale (virgole, quote, newline). */
export function parseCsvText(content: string): string[][] {
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

    if (char === ',') {
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

  return rows.filter((candidate) => candidate.some((cell) => cell.trim().length > 0));
}

function emptyRow(): Omit<ShopifyCsvRow, 'rowNumber'> {
  return {
    articleCode: '',
    handle: '',
    title: '',
    bodyHtml: '',
    vendor: '',
    type: '',
    tags: '',
    published: '',
    option1Name: '',
    option1Value: '',
    option2Name: '',
    option2Value: '',
    option3Name: '',
    option3Value: '',
    variantSku: '',
    variantPrice: '',
    variantCompareAtPrice: '',
    variantBarcode: '',
    imageSrc: '',
    imageAltText: '',
    imagePosition: '',
    seoTitle: '',
    seoDescription: '',
  };
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

function mapHeaders(
  headerRow: readonly string[],
): Map<keyof Omit<ShopifyCsvRow, 'rowNumber'>, number> {
  const mapping = new Map<keyof Omit<ShopifyCsvRow, 'rowNumber'>, number>();
  headerRow.forEach((header, index) => {
    const key = HEADER_ALIASES[normalizeHeader(header)];
    if (key && !mapping.has(key)) {
      mapping.set(key, index);
    }
  });
  return mapping;
}

function assertRequiredHeaders(mapping: Map<keyof Omit<ShopifyCsvRow, 'rowNumber'>, number>): void {
  if (!mapping.has('handle') || !mapping.has('title')) {
    throw new ShopifyCsvParseError('Il CSV deve contenere almeno le colonne Handle e Title.');
  }
}

export function parseShopifyProductCsv(content: string): ShopifyCsvRow[] {
  const matrix = parseCsvText(content);
  if (matrix.length < 2) {
    throw new ShopifyCsvParseError('Il file CSV non contiene righe prodotto.');
  }

  const headerMapping = mapHeaders(matrix[0] ?? []);
  assertRequiredHeaders(headerMapping);

  const rows: ShopifyCsvRow[] = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const raw = matrix[index] ?? [];
    const mapped: {
      -readonly [K in keyof ShopifyCsvRow]: ShopifyCsvRow[K];
    } = { rowNumber: index + 1, ...emptyRow() };

    for (const [field, columnIndex] of headerMapping.entries()) {
      mapped[field] = (raw[columnIndex] ?? '').trim();
    }

    if (!mapped.handle && !mapped.title && !mapped.variantSku) {
      continue;
    }

    rows.push(mapped);
  }

  if (rows.length === 0) {
    throw new ShopifyCsvParseError('Nessuna riga prodotto valida nel CSV.');
  }

  return rows;
}

/** Raggruppa righe CSV per Handle (semantica Shopify). */
export function groupShopifyCsvRows(rows: readonly ShopifyCsvRow[]): Map<string, ShopifyCsvRow[]> {
  const groups = new Map<string, ShopifyCsvRow[]>();
  for (const row of rows) {
    const handle = row.handle.trim() || slugFromTitle(row.title) || `row-${row.rowNumber}`;
    const bucket = groups.get(handle) ?? [];
    bucket.push({ ...row, handle });
    groups.set(handle, bucket);
  }
  return groups;
}

/** Slug handle Shopify derivato dal titolo prodotto. */
export function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
