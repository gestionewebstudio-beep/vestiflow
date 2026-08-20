import { UNPAGED_MAX_ROWS, pageWindow, unpagedResult } from './unpaged.util';

describe('risposte senza pagine', () => {
  it('con `all` non salta righe e chiede una in più del tetto', () => {
    expect(pageWindow({ all: true, page: 3, pageSize: 20 })).toEqual({
      take: UNPAGED_MAX_ROWS + 1,
    });
  });

  it('senza `all` resta la finestra di sempre', () => {
    expect(pageWindow({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('sotto il tetto consegna tutto e non dichiara troncamenti', () => {
    const righe = Array.from({ length: 5 }, (_, i) => i);

    expect(unpagedResult(righe, 5)).toEqual({
      items: righe,
      total: 5,
      page: 1,
      pageSize: 5,
      truncated: false,
    });
  });

  it('⛔ sopra il tetto taglia e LO DICE: una lista troncata in silenzio sembra completa', () => {
    const righe = Array.from({ length: UNPAGED_MAX_ROWS + 1 }, (_, i) => i);

    const esito = unpagedResult(righe, 9999);

    expect(esito.items).toHaveLength(UNPAGED_MAX_ROWS);
    expect(esito.truncated).toBe(true);
    // Il totale resta quello vero: serve a dire «di quante».
    expect(esito.total).toBe(9999);
  });
});
