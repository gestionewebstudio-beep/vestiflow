import { describe, expect, it } from 'vitest';

import { sedeDellOrdine } from './sales-order-sede.util';

const A = { id: 'sede-a', name: 'Sede A' };
const B = { id: 'sede-b', name: 'Sede B' };

describe('sedeDellOrdine — il raccordo della sede di un ordine', () => {
  it('la testata vince: un ordine manuale porta la propria sede', () => {
    expect(
      sedeDellOrdine({ location: A, reservations: [{ location: B }], onlineSale: null }),
    ).toEqual(A);
  });

  it('senza testata rispondono gli impegni attivi, se stanno su UNA sede', () => {
    expect(
      sedeDellOrdine({
        location: null,
        reservations: [{ location: B }, { location: B }],
        onlineSale: { location: A },
      }),
    ).toEqual(B);
  });

  it('⛔ impegni su sedi diverse: nessuna sede, mai la prima', () => {
    expect(
      sedeDellOrdine({
        location: null,
        reservations: [{ location: A }, { location: B }],
        onlineSale: { location: A },
      }),
    ).toBeNull();
  });

  it('evaso, senza impegni attivi: risponde la Vendita online', () => {
    expect(sedeDellOrdine({ location: null, reservations: [], onlineSale: { location: A } })).toEqual(
      A,
    );
  });

  it('annullato, o Vendita online senza sede: vuoto, ed è la verità', () => {
    expect(sedeDellOrdine({ location: null, reservations: [], onlineSale: null })).toBeNull();
    expect(
      sedeDellOrdine({ location: null, reservations: [], onlineSale: { location: null } }),
    ).toBeNull();
  });
});
