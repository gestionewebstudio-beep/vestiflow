import { describe, expect, it } from 'vitest';

import { formatDate } from '@core/utils/date.util';

import { counterpartyDocLabel } from '@domain/documents/models/document-labels.util';

// La data si confronta con `formatDate` e non con un letterale: il testo
// dipende dal fuso della macchina, la composizione della voce no.
const DATE = '2026-05-08';
const DATE_LABEL = formatDate(DATE);

describe('counterpartyDocLabel', () => {
  it('compone tipo, numero e data in una voce sola', () => {
    expect(
      counterpartyDocLabel({
        externalDocumentTypeSnapshot: 'DDT',
        externalDocNumber: '145',
        externalDocDate: DATE,
      }),
    ).toBe(`DDT 145 del ${DATE_LABEL}`);
  });

  it('omette il tipo quando manca lo snapshot', () => {
    expect(counterpartyDocLabel({ externalDocNumber: '145', externalDocDate: DATE })).toBe(
      `145 del ${DATE_LABEL}`,
    );
  });

  it('omette la data quando non è compilata', () => {
    expect(
      counterpartyDocLabel({ externalDocumentTypeSnapshot: 'FT', externalDocNumber: '99' }),
    ).toBe('FT 99');
  });

  it('mostra la sola data quando tipo e numero mancano', () => {
    expect(counterpartyDocLabel({ externalDocDate: DATE })).toBe(DATE_LABEL);
  });

  it('ignora i campi di soli spazi', () => {
    expect(
      counterpartyDocLabel({ externalDocumentTypeSnapshot: '  ', externalDocNumber: ' 145 ' }),
    ).toBe('145');
  });

  it('restituisce stringa vuota quando i tre campi sono vuoti', () => {
    expect(counterpartyDocLabel({})).toBe('');
  });
});
