import { escapeCsvField } from '../../common/csv.util';

export const INVENTORY_EXPORT_HEADERS = [
  'Variante',
  'SKU',
  'Location',
  'Disponibile',
  'Fisico',
  'Impegnato',
  'In arrivo',
  'Soglia minima',
] as const;

export type InventoryExportHeader = (typeof INVENTORY_EXPORT_HEADERS)[number];

export interface InventoryCsvImportRow {
  readonly rowNumber: number;
  readonly variantTitle: string;
  readonly sku: string;
  readonly locationName: string;
  readonly availableText: string;
  readonly minThresholdText: string;
}

const IMPORT_HEADER_ALIASES: Record<string, keyof Omit<InventoryCsvImportRow, 'rowNumber'>> = {
  variante: 'variantTitle',
  sku: 'sku',
  'variant sku': 'sku',
  location: 'locationName',
  disponibile: 'availableText',
  available: 'availableText',
  'on hand (new)': 'availableText',
  'on hand (current)': 'availableText',
  'soglia minima': 'minThresholdText',
  'min threshold': 'minThresholdText',
};

export class InventoryCsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryCsvParseError';
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

  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function inventoryImportKey(sku: string, locationName: string): string {
  return `${sku.trim().toLowerCase()}|${locationName.trim().toLowerCase()}`;
}

export function variantOptionValueLabels(optionValues: unknown): string[] {
  if (Array.isArray(optionValues)) {
    return optionValues
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return '';
        }
        const candidate = entry as { name?: unknown; value?: unknown };
        const value = typeof candidate.value === 'string' ? candidate.value.trim() : '';
        return value;
      })
      .filter((value) => value.length > 0);
  }

  if (optionValues && typeof optionValues === 'object') {
    return Object.values(optionValues as Record<string, unknown>)
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value.length > 0);
  }

  return [];
}

export function buildVariantTitle(productName: string, optionValues: unknown): string {
  const labels = variantOptionValueLabels(optionValues);
  if (labels.length === 0) {
    return productName;
  }
  return `${productName} — ${labels.join(' / ')}`;
}

export function parseInventoryImportCsv(content: string): InventoryCsvImportRow[] {
  const matrix = parseCsvText(content);
  if (matrix.length === 0) {
    throw new InventoryCsvParseError('Il file CSV è vuoto.');
  }

  const [headerRow, ...dataRows] = matrix;
  if (!headerRow) {
    throw new InventoryCsvParseError('Intestazioni CSV mancanti.');
  }

  const columnIndex = new Map<keyof Omit<InventoryCsvImportRow, 'rowNumber'>, number>();
  headerRow.forEach((header, index) => {
    const mapped = IMPORT_HEADER_ALIASES[normalizeHeader(header)];
    if (mapped) {
      columnIndex.set(mapped, index);
    }
  });

  if (!columnIndex.has('sku') || !columnIndex.has('locationName')) {
    throw new InventoryCsvParseError('Colonne obbligatorie mancanti: SKU e Location.');
  }
  if (!columnIndex.has('availableText')) {
    throw new InventoryCsvParseError('Colonna obbligatoria mancante: Disponibile.');
  }

  const readCell = (
    row: readonly string[],
    key: keyof Omit<InventoryCsvImportRow, 'rowNumber'>,
  ): string => {
    const index = columnIndex.get(key);
    if (index === undefined) {
      return '';
    }
    return (row[index] ?? '').trim();
  };

  const parsed: InventoryCsvImportRow[] = [];
  dataRows.forEach((row, index) => {
    const sku = readCell(row, 'sku');
    const locationName = readCell(row, 'locationName');
    const availableText = readCell(row, 'availableText');
    if (!sku && !locationName && !availableText) {
      return;
    }

    parsed.push({
      rowNumber: index + 2,
      variantTitle: readCell(row, 'variantTitle'),
      sku,
      locationName,
      availableText,
      minThresholdText: readCell(row, 'minThresholdText'),
    });
  });

  if (parsed.length === 0) {
    throw new InventoryCsvParseError('Nessuna riga dati trovata nel CSV.');
  }

  return parsed;
}

export function serializeInventoryLevelsCsv(
  rows: readonly Record<InventoryExportHeader, string>[],
  headers: readonly InventoryExportHeader[] = INVENTORY_EXPORT_HEADERS,
): string {
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvField(row[header])).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}
