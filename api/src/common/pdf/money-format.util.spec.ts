import { describe, expect, it } from 'vitest';

import { formatMinorAmount, formatPercent } from './money-format.util';

// La stampa è un punto di USCITA: è qui che il denaro smette di essere
// calcolato e diventa qualcosa che qualcuno legge. Quattro servizi PDF
// passano da queste due funzioni — documenti, ordini cliente, ordini
// fornitore, corrispettivi — quindi quello che si verifica qui vale per tutti.
describe('formatMinorAmount', () => {
  it('stampa due decimali con i separatori italiani', () => {
    expect(formatMinorAmount(2990)).toBe('€ 29,90');
    expect(formatMinorAmount(123456789)).toBe('€ 1.234.567,89');
    expect(formatMinorAmount(0)).toBe('€ 0,00');
    expect(formatMinorAmount(-1050)).toBe('€ -10,50');
  });

  // §sei decimali: un prezzo digitato ivato non ha un netto intero in unità
  // minori. In stampa la coda non si vede mai — due decimali, sempre.
  it('arrotonda la coda decimale del netto scorporato', () => {
    expect(formatMinorAmount(10161.4754)).toBe('€ 101,61');
    expect(formatMinorAmount(2049.1803)).toBe('€ 20,49');
  });

  it('valute diverse dall euro restano suffissate dal codice', () => {
    expect(formatMinorAmount(2990, 'USD')).toBe('29,90 USD');
  });
});

describe('formatPercent', () => {
  // Lo sconto a cascata «4+10%» vale 13,6%: i decimali vanno stampati, con la
  // virgola. Uno sconto secco resta senza.
  it('stampa i decimali solo se ci sono, con la virgola', () => {
    expect(formatPercent(13.6)).toBe('13,6%');
    expect(formatPercent(10)).toBe('10%');
    expect(formatPercent(14.348)).toBe('14,35%');
  });
});
