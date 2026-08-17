import { SalesOrderFinancialStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  accumulaCorrispettivi,
  sommaTotali,
  type RigheDaSommare,
} from './corrispettivi-totals.util';

/**
 * L'accumulatore del Registro (`docs/10` §16, passo 3).
 *
 * ⚠️ **La proprietà presidiata qui non è «i conti tornano»: è che tornino
 * ANCHE spezzati.** Il blocco B introdurrà i subtotali per giornata, e la
 * garanzia richiesta è
 *
 *     somma dei sottoinsiemi = riepilogo del periodo
 *
 * che vale solo se la matematica è fatta di sole somme e differenze. Basta un
 * `Math.max(0, …)` dentro il ciclo perché smetta di valere — silenziosamente, e
 * solo su certi insiemi.
 */

const VUOTE: RigheDaSommare = {
  ordini: [],
  venditeBanco: [],
  corrispettiviManuali: [],
  rettifiche: [],
  annullamenti: [],
};

function ordine(over: Partial<RigheDaSommare['ordini'][number]> = {}) {
  return {
    subtotalMinor: 10000,
    taxMinor: 2200,
    shippingMinor: 0,
    discountMinor: 0,
    totalMinor: 12200,
    financialStatus: SalesOrderFinancialStatus.paid,
    ...over,
  };
}

describe('additività — la proprietà per cui l’accumulatore esiste', () => {
  it('spezzare l’insieme non cambia il totale', () => {
    const primo: RigheDaSommare = {
      ...VUOTE,
      ordini: [ordine(), ordine({ totalMinor: 5000, taxMinor: 900, subtotalMinor: 4100 })],
      venditeBanco: [{ taxMinor: 180, totalMinor: 1000 }],
    };
    const secondo: RigheDaSommare = {
      ...VUOTE,
      corrispettiviManuali: [{ subtotalMinor: 2049, taxMinor: 451, totalMinor: 2500 }],
      rettifiche: [{ totalMinor: 3000, taxMinor: 540 }],
      annullamenti: [{ totalMinor: 700 }],
    };

    const insieme = accumulaCorrispettivi({
      ordini: [...primo.ordini, ...secondo.ordini],
      venditeBanco: [...primo.venditeBanco, ...secondo.venditeBanco],
      corrispettiviManuali: [...primo.corrispettiviManuali, ...secondo.corrispettiviManuali],
      rettifiche: [...primo.rettifiche, ...secondo.rettifiche],
      annullamenti: [...primo.annullamenti, ...secondo.annullamenti],
    });

    expect(sommaTotali(accumulaCorrispettivi(primo), accumulaCorrispettivi(secondo))).toEqual(
      insieme,
    );
  });

  /**
   * ⚠️ **Il caso che il clamp romperebbe**, ed è la ragione per cui sta fuori.
   * Un sottoinsieme in cui le rettifiche superano le vendite ha un imponibile
   * netto negativo: con `max(0, …)` dentro la matematica uscirebbe 0, e la
   * somma delle parti supererebbe il tutto.
   */
  it('un sottoinsieme in perdita porta il suo segno, e la somma resta giusta', () => {
    const venduto: RigheDaSommare = { ...VUOTE, ordini: [ordine()] };
    const restituito: RigheDaSommare = {
      ...VUOTE,
      rettifiche: [{ totalMinor: 20000, taxMinor: 3600 }],
    };

    const soloResi = accumulaCorrispettivi(restituito);
    expect(soloResi.netTotalMinor).toBe(-20000);
    expect(soloResi.netTaxableMinor).toBe(-16400);

    const tutto = accumulaCorrispettivi({ ...venduto, rettifiche: restituito.rettifiche });
    expect(sommaTotali(accumulaCorrispettivi(venduto), soloResi)).toEqual(tutto);
  });

  it('l’insieme vuoto è l’elemento neutro', () => {
    const totali = accumulaCorrispettivi({ ...VUOTE, ordini: [ordine()] });

    expect(sommaTotali(totali, accumulaCorrispettivi(VUOTE))).toEqual(totali);
  });
});

describe('le regole per sorgente, che non sono uguali fra loro', () => {
  it('la Vendita al banco ricava l’imponibile; il Corrispettivo manuale lo LEGGE', () => {
    const banco = accumulaCorrispettivi({
      ...VUOTE,
      venditeBanco: [{ taxMinor: 180, totalMinor: 1000 }],
    });
    expect(banco.subtotalMinor).toBe(820);

    // Il manuale porta un imponibile sommato dalle sue righe per aliquota, che
    // NON è totale − imposta arrotondato: è l'unica sorgente che sa dirlo.
    const manuale = accumulaCorrispettivi({
      ...VUOTE,
      corrispettiviManuali: [{ subtotalMinor: 2049, taxMinor: 451, totalMinor: 2500 }],
    });
    expect(manuale.subtotalMinor).toBe(2049);
  });

  it('gli annullamenti si contano e non si sottraggono mai', () => {
    const totali = accumulaCorrispettivi({
      ...VUOTE,
      ordini: [ordine()],
      annullamenti: [{ totalMinor: 5000 }, { totalMinor: 700 }],
    });

    expect(totali.cancellationCount).toBe(2);
    expect(totali.cancellationTotalMinor).toBe(5700);
    // Il netto non li ha visti: quella vendita nel registro non è mai entrata.
    expect(totali.netTotalMinor).toBe(12200);
  });

  it('conta le vendite rimborsate senza toglierle dal totale', () => {
    const totali = accumulaCorrispettivi({
      ...VUOTE,
      ordini: [ordine(), ordine({ financialStatus: SalesOrderFinancialStatus.refunded })],
    });

    expect(totali.refundsCount).toBe(1);
    expect(totali.orderCount).toBe(2);
  });
});
