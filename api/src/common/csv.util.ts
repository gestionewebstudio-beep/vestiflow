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
