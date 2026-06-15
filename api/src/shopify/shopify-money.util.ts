/** Converte stringa decimale Shopify (es. "29.90") in unità minori intere. */
export function shopifyDecimalToMinor(amount: string, decimals = 2): number {
  const trimmed = amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return 0;
  }
  const negative = trimmed.startsWith('-');
  const normalized = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ''] = normalized.split('.');
  const frac = fracPart.padEnd(decimals, '0').slice(0, decimals);
  const minor = Number(`${intPart}${frac}`);
  if (!Number.isSafeInteger(minor)) {
    return 0;
  }
  return negative ? -minor : minor;
}

export function shopifyGid(type: string, id: string | number): string {
  return `gid://shopify/${type}/${id}`;
}
