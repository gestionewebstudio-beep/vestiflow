import { describe, expect, it } from 'vitest';

import { parseItalianDateInput } from '@shared/utils/calendar.util';

import { formatDate, formatDateTime, formatDateTimeShort } from './date.util';

/**
 * ⭐ **Le date si scrivono in NUMERI** — proprietario, 01/09/2026: «avere un
 * formato data col testo e non col numero non ci permette di inserire una data
 * manualmente… è anche incoerente con le date presenti nei documenti».
 */
describe('date.util — il formato è GG/MM/AAAA', () => {
  it('⭐ formatDate scrive la data in cifre, con giorno e mese a due', () => {
    expect(formatDate('2026-06-09T12:00:00.000Z')).toBe('09/06/2026');
  });

  /*
    ⛔ **Qui c'era `toMatch(/9.*giu.*2026/i)`**, cioè «11 ago 2026»: il formato
    che il proprietario ha respinto. Restava verde anche con giorno e mese a una
    cifra sola, che in colonna disallinea le date.
  */
  it('⛔ niente nomi di mese, e niente cifre singole', () => {
    const testo = formatDate('2026-08-07T12:00:00.000Z');
    expect(testo).toBe('07/08/2026');
    expect(testo).not.toMatch(/[a-z]/i);
  });

  /*
    ⭐ **È il formato che i filtri accettano in digitazione**, ed è il punto:
    chi legge una data in tabella deve poterla ribattere nel filtro così com'è.
  */
  it('⭐ ciò che si legge in tabella si può ribattere nel filtro', () => {
    const mostrata = formatDate('2026-09-01T00:00:00.000Z');
    expect(parseItalianDateInput(mostrata)).toBe('2026-09-01');
  });

  it('formatDateTime aggiunge l’ora alla stessa data numerica', () => {
    const testo = formatDateTime('2026-06-09T14:30:00.000Z');
    expect(testo).toMatch(/^09\/06\/2026, \d{2}:\d{2}$/);
  });

  it('⚠️ la compatta resta senza anno: è il badge della topbar', () => {
    expect(formatDateTimeShort('2026-06-09T14:30:00.000Z')).toMatch(/^09\/06, \d{2}:\d{2}$/);
  });
});
