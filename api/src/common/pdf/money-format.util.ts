const EUR_AMOUNT_FORMAT = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Importi in unità minori → stringa EUR per PDF/export. */
export function formatMinorAmount(minor: number, currencyCode = 'EUR'): string {
  const formatted = EUR_AMOUNT_FORMAT.format(minor / 100);
  if (currencyCode === 'EUR') {
    return `€ ${formatted}`;
  }
  return `${formatted} ${currencyCode}`;
}
