import { describe, expect, it } from 'vitest';

import { CORRISPETTIVI_ACCOUNTANT_HEADERS } from './corrispettivi-export.service';

/**
 * Test incrociato fra la decisione funzionale e il file che esce.
 *
 * La regola del 16/08/2026 è che **stampare o esportare non genera stati**:
 * l'operatore sceglie un periodo e produce il file quante volte vuole. Un
 * export che porta una colonna «Data consegna commercialista» contraddice
 * quella regola anche se nessuno la compila — perché **promette un flusso che
 * non esiste** a chi apre il foglio.
 *
 * Lo stesso vale per «Stato fiscale»: il Registro classifica per **origine**,
 * che è un fatto della vendita, non per uno stato parallelo.
 *
 * ⚠️ Questo test guarda le INTESTAZIONI, non le righe, ed è voluto: le
 * intestazioni sono il contratto del file verso il commercialista, e sono la
 * cosa che si riaggiunge per prima quando qualcuno «serve anche questo campo».
 */
describe('export corrispettivi — colonne del file', () => {
  it('non porta le colonne del vecchio flusso commercialista', () => {
    expect(CORRISPETTIVI_ACCOUNTANT_HEADERS).not.toContain('Data consegna commercialista');
    expect(CORRISPETTIVI_ACCOUNTANT_HEADERS).not.toContain('Stato fiscale');
  });

  it('porta le colonne economiche che il commercialista usa davvero', () => {
    for (const attesa of [
      'Data',
      'Tipo',
      'Numero ordine',
      'Canale',
      'Imponibile',
      'IVA',
      'Totale',
      'Valuta',
    ]) {
      expect(CORRISPETTIVI_ACCOUNTANT_HEADERS).toContain(attesa);
    }
  });

  it('nessuna intestazione nomina consegne, invii o registrazioni', () => {
    const sospette = CORRISPETTIVI_ACCOUNTANT_HEADERS.filter((h) =>
      /consegn|inviat|registrat|commercialista/i.test(h),
    );
    expect(sospette).toEqual([]);
  });
});
