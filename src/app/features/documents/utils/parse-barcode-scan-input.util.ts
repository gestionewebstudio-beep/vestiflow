/** Parsing input lettore barcode Danea-style: `148*8001234567890` → qty 148 + codice. */
export function parseBarcodeScanInput(raw: string): {
  readonly quantity: number;
  readonly code: string;
} {
  const trimmed = raw.trim();
  const match = /^(\d+)\*(.+)$/.exec(trimmed);
  if (match?.[1] && match[2]) {
    const quantity = Number.parseInt(match[1], 10);
    const code = match[2].trim();
    if (Number.isFinite(quantity) && quantity > 0 && code.length > 0) {
      return { quantity, code };
    }
  }
  return { quantity: 1, code: trimmed };
}
