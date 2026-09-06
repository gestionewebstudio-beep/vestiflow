import { pageWindow } from './unpaged.util';

/**
 * ⛔ **Nessun tetto sulle righe** (deciso il 21/08/2026): il contenimento è il
 * filtro periodo, non un numero. Con `all` la finestra sparisce del tutto —
 * niente `take`, quindi niente limite silenzioso.
 */
describe('finestra delle liste', () => {
  it('con `all` non c’è nessuna finestra: si legge tutto il filtrato', () => {
    expect(pageWindow({ all: true, page: 3, pageSize: 20 })).toEqual({});
  });

  it('senza `all` resta la pagina di sempre', () => {
    expect(pageWindow({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('la prima pagina non salta niente', () => {
    expect(pageWindow({ page: 1, pageSize: 50 })).toEqual({ skip: 0, take: 50 });
  });
});
