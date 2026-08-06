import { describe, expect, it } from 'vitest';

import type { VatCode } from '@core/models/vat-code.model';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { vatCodeSelectOption, vatOptionsIncludingSelected } from './document-vat-options.util';

function vatCode(over: Partial<VatCode> = {}): VatCode {
  return {
    id: 'vat-22',
    code: '22',
    ratePercent: 22,
    description: 'Imponibile 22%',
    ...over,
  } as VatCode;
}

describe('vatCodeSelectOption', () => {
  it('usa il codice come etichetta e aliquota + descrizione come dettaglio', () => {
    expect(vatCodeSelectOption(vatCode({ description: 'Aliquota ordinaria' }))).toEqual({
      value: 'vat-22',
      label: '22',
      detail: '22% · Aliquota ordinaria',
    });
  });

  it('non ripete l’aliquota se già presente nella descrizione', () => {
    expect(vatCodeSelectOption(vatCode({ description: 'Imponibile 22%' })).detail).toBe(
      'Imponibile 22%',
    );
  });

  it('confronta l’aliquota ignorando maiuscole e spazi ai bordi', () => {
    expect(vatCodeSelectOption(vatCode({ description: '  IMPONIBILE 22%  ' })).detail).toBe(
      'IMPONIBILE 22%',
    );
  });
});

describe('vatOptionsIncludingSelected', () => {
  const attive: readonly SelectMenuOption[] = [
    { value: 'vat-22', label: '22' },
    { value: 'vat-10', label: '10' },
  ];

  it('senza selezione restituisce le sole opzioni attive', () => {
    expect(vatOptionsIncludingSelected(attive, null, new Map())).toBe(attive);
    expect(vatOptionsIncludingSelected(attive, '', new Map())).toBe(attive);
  });

  it('se il selezionato è già fra le attive non aggiunge nulla', () => {
    expect(vatOptionsIncludingSelected(attive, 'vat-22', new Map())).toBe(attive);
  });

  it('aggiunge in coda il codice selezionato ma non più attivo', () => {
    const storico = vatCode({ id: 'vat-old', code: '21', ratePercent: 21, description: 'Vecchia' });

    const result = vatOptionsIncludingSelected(attive, 'vat-old', new Map([['vat-old', storico]]));

    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ value: 'vat-old', label: '21', detail: '21% · Vecchia' });
  });

  it('se il codice selezionato non esiste più affatto, lascia le attive', () => {
    expect(vatOptionsIncludingSelected(attive, 'vat-sparito', new Map())).toBe(attive);
  });
});
