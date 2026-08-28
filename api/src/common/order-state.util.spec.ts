import { ConflictException } from '@nestjs/common';
import { SalesOrderFulfillmentStatus, SupplierOrderStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  OrderState,
  assertManualTransition,
  canTransitionManually,
  isEligibleAsSource,
  isStateLocked,
  manualSalesOrderState,
  supplierOrderState,
} from './order-state.util';

const TUTTI: readonly OrderState[] = [
  OrderState.ToConfirm,
  OrderState.Confirmed,
  OrderState.Concluded,
  OrderState.Cancelled,
];

describe('Macchina stati ordini — eleggibilità', () => {
  it('solo Confermato è eleggibile come sorgente di Includi/Genera', () => {
    const eleggibili = TUTTI.filter(isEligibleAsSource);
    expect(eleggibili).toEqual([OrderState.Confirmed]);
  });

  // ⚠️ L'asserzione che conta davvero: non basta che Confermato passi, serve
  // che gli altri tre siano fermati. Un predicato sempre-vero passerebbe il
  // test qui sopra da solo.
  it.each([OrderState.ToConfirm, OrderState.Concluded, OrderState.Cancelled])(
    '%s non è eleggibile',
    (stato) => {
      expect(isEligibleAsSource(stato)).toBe(false);
    },
  );
});

describe('Macchina stati ordini — il blocco del Concluso', () => {
  it('solo Concluso blocca lo stato', () => {
    expect(TUTTI.filter(isStateLocked)).toEqual([OrderState.Concluded]);
  });

  it('da Concluso non si esce a mano, in nessuna direzione', () => {
    for (const verso of TUTTI) {
      expect(canTransitionManually(OrderState.Concluded, verso)).toBe(false);
    }
  });

  it('e il rifiuto dice come uscirne davvero: togliendo il legame', () => {
    expect(() => assertManualTransition(OrderState.Concluded, OrderState.Cancelled)).toThrow(
      ConflictException,
    );
    expect(() => assertManualTransition(OrderState.Concluded, OrderState.Cancelled)).toThrow(
      /annulla o elimina prima il documento collegato/,
    );
  });
});

describe('Macchina stati ordini — le transizioni manuali', () => {
  const LIBERI = [OrderState.ToConfirm, OrderState.Confirmed, OrderState.Cancelled] as const;

  it('i tre stati liberi si raggiungono fra loro in entrambe le direzioni', () => {
    for (const da of LIBERI) {
      for (const a of LIBERI) {
        expect(canTransitionManually(da, a)).toBe(true);
      }
    }
  });

  // ⭐ È la decisione del 28/08: Annullato è uno stato, non un comando, e si
  // torna indietro. Senza questa prova la reversibilità è solo un commento.
  it('Annullato è reversibile: si torna a Confermato e a Da confermare', () => {
    expect(canTransitionManually(OrderState.Cancelled, OrderState.Confirmed)).toBe(true);
    expect(canTransitionManually(OrderState.Cancelled, OrderState.ToConfirm)).toBe(true);
  });

  it('a Concluso non ci si arriva mai a mano: è derivato', () => {
    for (const da of LIBERI) {
      expect(canTransitionManually(da, OrderState.Concluded)).toBe(false);
      expect(() => assertManualTransition(da, OrderState.Concluded)).toThrow(
        /non si imposta a mano/,
      );
    }
  });

  it('una transizione ammessa non lancia', () => {
    expect(() => assertManualTransition(OrderState.Confirmed, OrderState.Cancelled)).not.toThrow();
  });
});

describe('Adattatore Ordine fornitore', () => {
  it.each([
    [SupplierOrderStatus.confirmed, OrderState.Confirmed],
    [SupplierOrderStatus.concluded, OrderState.Concluded],
    [SupplierOrderStatus.cancelled, OrderState.Cancelled],
  ])('%s → %s', (status, atteso) => {
    expect(supplierOrderState({ status })).toBe(atteso);
  });

  // ⚠️ Inchioda la distanza dalla decisione, così quando la migration arriverà
  // questo test fallisce e obbliga ad aggiornare l'adattatore invece di
  // lasciarlo indietro in silenzio.
  it('oggi non può produrre «Da confermare»: la colonna non ha quel valore', () => {
    const prodotti = Object.values(SupplierOrderStatus).map((status) =>
      supplierOrderState({ status }),
    );
    expect(prodotti).not.toContain(OrderState.ToConfirm);
  });
});

describe('Adattatore Ordine cliente manuale', () => {
  const base = {
    cancelledAt: null,
    fulfilledAt: null,
    fulfillmentStatus: SalesOrderFulfillmentStatus.unfulfilled,
  };

  it('un ordine appena salvato è Confermato', () => {
    expect(manualSalesOrderState(base)).toBe(OrderState.Confirmed);
  });

  it('annullato vince su tutto', () => {
    expect(
      manualSalesOrderState({
        ...base,
        cancelledAt: new Date('2026-08-01'),
        fulfilledAt: new Date('2026-08-02'),
        fulfillmentStatus: SalesOrderFulfillmentStatus.fulfilled,
      }),
    ).toBe(OrderState.Cancelled);
  });

  it('evaso è Concluso', () => {
    expect(manualSalesOrderState({ ...base, fulfilledAt: new Date('2026-08-02') })).toBe(
      OrderState.Concluded,
    );
  });

  // ⭐ La decisione, non una comodità: «Parzialmente concluso» è abolito, e una
  // copertura ridotta conclude comunque l'ordine.
  it('parzialmente evaso si legge Concluso, non uno stato a sé', () => {
    expect(
      manualSalesOrderState({
        ...base,
        fulfillmentStatus: SalesOrderFulfillmentStatus.partially_fulfilled,
      }),
    ).toBe(OrderState.Concluded);
  });

  it('e non è eleggibile, come non lo era prima', () => {
    const stato = manualSalesOrderState({
      ...base,
      fulfillmentStatus: SalesOrderFulfillmentStatus.partially_fulfilled,
    });
    expect(isEligibleAsSource(stato)).toBe(false);
  });

  it('oggi non può produrre «Da confermare»: non c’è dove memorizzarlo', () => {
    const combinazioni = [
      base,
      { ...base, fulfilledAt: new Date() },
      { ...base, cancelledAt: new Date() },
      { ...base, fulfillmentStatus: SalesOrderFulfillmentStatus.partially_fulfilled },
      { ...base, fulfillmentStatus: SalesOrderFulfillmentStatus.fulfilled },
    ];
    expect(combinazioni.map(manualSalesOrderState)).not.toContain(OrderState.ToConfirm);
  });
});
