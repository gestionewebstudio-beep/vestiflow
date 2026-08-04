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

const PERCENT_FORMAT = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

/**
 * Percentuale di sconto in stampa. I decimali compaiono solo se ci sono: una
 * cascata «4+10%» vale 13,6% e va stampata così, uno sconto secco resta «10%».
 */
export function formatPercent(value: number): string {
  return `${PERCENT_FORMAT.format(value)}%`;
}
