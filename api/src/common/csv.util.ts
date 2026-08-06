export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeCsv(
  headers: readonly string[],
  rows: readonly Record<string, string>[],
): string {
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvField(row[header] ?? '')).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

/** BOM UTF-8: forza Excel a leggere i caratteri accentati correttamente. */
const UTF8_BOM = '\uFEFF';

/** Delimitatore Excel italiano (separatore di elenco predefinito di sistema). */
const IT_CSV_DELIMITER = ';';

/** Escape per CSV con delimitatore ';': quota solo su ';', '"' o newline. */
export function escapeSemicolonCsvField(value: string): string {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * CSV ottimizzato per Excel italiano: BOM UTF-8 (accenti corretti),
 * delimitatore ';' (colonne separate all'apertura) e terminatori CRLF.
 * Gli importi nelle righe devono essere già formattati it-IT (virgola decimale).
 */
export function serializeItalianExcelCsv(
  headers: readonly string[],
  rows: readonly Record<string, string>[],
): string {
  const lines = [
    headers.join(IT_CSV_DELIMITER),
    ...rows.map((row) =>
      headers.map((header) => escapeSemicolonCsvField(row[header] ?? '')).join(IT_CSV_DELIMITER),
    ),
  ];
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}
