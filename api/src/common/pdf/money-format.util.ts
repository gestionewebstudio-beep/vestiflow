// ⭐ Il punto delle migliaia SEMPRE, anche a quattro cifre (proprietario, 13/09/2026):
//    it-IT da solo scrive «2249,85» e raggruppa solo da cinque cifre in su. Stessa
//    regola di `formatMoney` nel frontend: una stampa si legge come una schermata.
const EUR_AMOUNT_FORMAT = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
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
