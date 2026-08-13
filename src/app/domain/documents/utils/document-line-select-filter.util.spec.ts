import { describe, expect, it } from 'vitest';

import { filterLineSelectOptions } from './document-line-select-filter.util';

/** I codici IVA veri del caso che ha fatto nascere la regola. */
const IVA = [
  { value: '1', label: '4', detail: '4% · Imponibile 4%' },
  { value: '2', label: '10', detail: '10% · Imponibile 10%' },
  { value: '3', label: '22', detail: '22% · Imponibile 22%' },
  { value: '4', label: '22r', detail: '22% · Imp. 22% acquisti rev. charge art. 17' },
] as const;

const codici = (options: readonly { readonly label: string }[]) => options.map((o) => o.label);

describe('filterLineSelectOptions', () => {
  it('senza testo l’elenco resta intero e nell’ordine ricevuto', () => {
    expect(codici(filterLineSelectOptions(IVA, '   '))).toEqual(['4', '10', '22', '22r']);
  });

  // È il caso che ha smontato il filtro vecchio: digitando «1» pescava «22r»
  // per l'«1» di «art. 17», e lo metteva pure prima di «10».
  it('a un carattere il codice viene prima della descrizione', () => {
    expect(codici(filterLineSelectOptions(IVA, '1'))).toEqual(['10', '22r']);
  });

  it('il prefisso del codice precede ogni altra corrispondenza', () => {
    expect(codici(filterLineSelectOptions(IVA, '22'))).toEqual(['22', '22r']);
  });

  it('chi non corrisponde affatto resta fuori: «il resto» è il resto dei risultati', () => {
    expect(filterLineSelectOptions(IVA, 'zzz')).toEqual([]);
  });

  it('cerca senza badare alle maiuscole', () => {
    const um = [
      { value: 'pz', label: 'pz' },
      { value: 'Conf', label: 'Conf' },
    ];
    expect(codici(filterLineSelectOptions(um, 'CO'))).toEqual(['Conf']);
  });
});
