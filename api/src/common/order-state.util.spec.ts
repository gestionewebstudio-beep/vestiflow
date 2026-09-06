import { ConflictException } from '@nestjs/common';
import { OrderCommercialState, SalesOrderSource, SupplierOrderStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  OrderState,
  assertManualTransition,
  canTransitionManually,
  isEligibleAsSource,
  isStateLocked,
  coerenzaCollegamento,
  eleggibileConGuardia,
  leggiStatoOrdineCliente,
  statoOrdineClienteRichiesto,
  supplierOrderStatusDa,
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
    [SupplierOrderStatus.to_confirm, OrderState.ToConfirm],
    [SupplierOrderStatus.confirmed, OrderState.Confirmed],
    [SupplierOrderStatus.concluded, OrderState.Concluded],
    [SupplierOrderStatus.cancelled, OrderState.Cancelled],
  ])('%s → %s', (status, atteso) => {
    expect(supplierOrderState({ status })).toBe(atteso);
  });

  // ⚠️ Qui c'era «oggi non può produrre Da confermare: la colonna non ha quel
  //    valore». Era scritto per FALLIRE all'arrivo della migration, e ha fatto
  //    il suo mestiere: l'enum ora ha quattro valori.
  it('⭐ ora sa produrre tutti e quattro gli stati', () => {
    const prodotti = Object.values(SupplierOrderStatus).map((status) =>
      supplierOrderState({ status }),
    );
    expect(new Set(prodotti)).toEqual(new Set(TUTTI));
  });

  it('e la conversione inversa è totale', () => {
    for (const stato of TUTTI) {
      expect(supplierOrderState({ status: supplierOrderStatusDa(stato) })).toBe(stato);
    }
  });
});

describe('Ordine cliente manuale — lo stato si LEGGE, non si deduce', () => {
  const manuale = (commercialState: OrderCommercialState | null) => ({
    source: SalesOrderSource.manual,
    commercialState,
  });

  it.each([
    [OrderCommercialState.to_confirm, OrderState.ToConfirm],
    [OrderCommercialState.confirmed, OrderState.Confirmed],
    [OrderCommercialState.concluded, OrderState.Concluded],
    [OrderCommercialState.cancelled, OrderState.Cancelled],
  ])('%s → %s', (persistito, atteso) => {
    const lettura = leggiStatoOrdineCliente(manuale(persistito));
    expect(lettura).toEqual({ ok: true, state: atteso });
  });

  /**
   * ⛔ La prova che vieta il ripiego: un ordine manuale senza stato NON viene
   * dedotto dai campi del canale. È un'incoerenza, e si dichiara.
   */
  it('⛔ manuale senza stato: incoerenza, non una deduzione', () => {
    expect(leggiStatoOrdineCliente(manuale(null))).toEqual({
      ok: false,
      motivo: 'stato-assente',
    });
    expect(() => statoOrdineClienteRichiesto(manuale(null))).toThrow(ConflictException);
  });

  it.each([
    SalesOrderSource.shopify_online,
    SalesOrderSource.shopify_pos,
    SalesOrderSource.store,
  ])('%s non ha un ciclo commerciale VestiFlow', (source) => {
    expect(leggiStatoOrdineCliente({ source, commercialState: null })).toEqual({
      ok: false,
      motivo: 'ordine-di-canale',
    });
  });

  /**
   * ⚠️ Anche se qualcuno riempisse la colonna su un ordine di canale — che il
   * database non impedisce, perché non c'è un DEFAULT ma nemmeno un vincolo —
   * la lettura resta «non è roba nostra». È il `source` a decidere.
   */
  it("⚠️ un ordine di canale con lo stato valorizzato resta fuori", () => {
    expect(
      leggiStatoOrdineCliente({
        source: SalesOrderSource.shopify_online,
        commercialState: OrderCommercialState.confirmed,
      }),
    ).toEqual({ ok: false, motivo: 'ordine-di-canale' });
  });
});

describe('Guardia d’integrità fra stato e collegamento', () => {
  it.each([
    [OrderState.Confirmed, false, 'coerente'],
    [OrderState.Concluded, true, 'coerente'],
    [OrderState.ToConfirm, false, 'coerente'],
    [OrderState.Cancelled, false, 'coerente'],
  ])('%s con collegamento=%s → %s', (stato, link, atteso) => {
    expect(coerenzaCollegamento(stato, link)).toBe(atteso);
  });

  it('⛔ confermato CON collegamento attivo: lo stato è vecchio', () => {
    expect(coerenzaCollegamento(OrderState.Confirmed, true)).toBe('stato-vecchio');
  });

  it('⛔ concluso SENZA collegamento: il legame è vecchio', () => {
    expect(coerenzaCollegamento(OrderState.Concluded, false)).toBe('legame-vecchio');
  });

  /**
   * ⭐ Fail closed, ed è il punto: un ordine incoerente non deve ricomparire in
   * silenzio fra gli includibili (`12` §0.4-bis).
   */
  it('⛔ un incoerente NON è eleggibile, benché il suo stato sia Confermato', () => {
    expect(isEligibleAsSource(OrderState.Confirmed)).toBe(true);
    expect(eleggibileConGuardia(OrderState.Confirmed, true)).toBe(false);
  });

  it('✅ un coerente Confermato è eleggibile', () => {
    expect(eleggibileConGuardia(OrderState.Confirmed, false)).toBe(true);
  });

  it.each([OrderState.ToConfirm, OrderState.Concluded, OrderState.Cancelled])(
    '%s non è eleggibile in nessun caso',
    (stato) => {
      expect(eleggibileConGuardia(stato, false)).toBe(false);
      expect(eleggibileConGuardia(stato, true)).toBe(false);
    },
  );
});
