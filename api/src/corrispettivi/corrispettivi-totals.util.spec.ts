import { SalesOrderFinancialStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  accumulaCorrispettivi,
  accumulaPerGiorno,
  sommaTotali,
  totaleDaiGiorni,
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

/**
 * I subtotali per giornata (`docs/10` §17, blocco B).
 *
 * ⚠️ **La riconciliazione non è verificata: è costruita.** Il totale del
 * periodo si ricava sommando le giornate, quindi non esistono due percorsi che
 * potrebbero divergere — ne esiste uno letto a due granularità. Questi test
 * misurano che quella costruzione regga sui casi che contano, compreso quello
 * in cui una giornata è in perdita.
 */

const G18 = new Date('2026-08-18T10:00:00.000Z');
const G17 = new Date('2026-08-17T10:00:00.000Z');

function venditaDi(giorno: Date, totale: number, imposta: number) {
  return {
    subtotalMinor: totale - imposta,
    taxMinor: imposta,
    shippingMinor: 0,
    discountMinor: 0,
    totalMinor: totale,
    financialStatus: SalesOrderFinancialStatus.paid,
    occurredAt: giorno,
  };
}

const VUOTE_PER_GIORNO = {
  ordini: [] as ReturnType<typeof venditaDi>[],
  venditeBanco: [] as { taxMinor: number; totalMinor: number; occurredAt: Date }[],
  corrispettiviManuali: [] as {
    subtotalMinor: number;
    taxMinor: number;
    totalMinor: number;
    occurredAt: Date;
  }[],
  rettifiche: [] as { totalMinor: number; taxMinor: number; occurredAt: Date }[],
  annullamenti: [] as { totalMinor: number; occurredAt: Date }[],
};

describe('subtotali per giornata', () => {
  /** L'esempio della specifica: 18/08 → 130, 17/08 → 70, periodo → 200. */
  const SCENARIO = {
    ...VUOTE_PER_GIORNO,
    ordini: [
      venditaDi(G18, 10000, 1800),
      venditaDi(G18, 5000, 900),
      venditaDi(G17, 8000, 1440),
    ],
    rettifiche: [
      { totalMinor: 2000, taxMinor: 360, occurredAt: G18 },
      { totalMinor: 1000, taxMinor: 180, occurredAt: G17 },
    ],
  };

  it('due giornate distinte, in ordine decrescente', () => {
    const giorni = accumulaPerGiorno(SCENARIO);

    expect(giorni.map((g) => g.giorno)).toEqual(['2026-08-18', '2026-08-17']);
  });

  it('i totali di giornata sono quelli attesi', () => {
    const [diciotto, diciassette] = accumulaPerGiorno(SCENARIO);

    // 100 + 50 − 20 = 130
    expect(diciotto!.totali.netTotalMinor).toBe(13000);
    // 80 − 10 = 70
    expect(diciassette!.totali.netTotalMinor).toBe(7000);
  });

  it('130 + 70 = 200, e vale su imponibile e IVA insieme al totale', () => {
    const giorni = accumulaPerGiorno(SCENARIO);
    const periodo = totaleDaiGiorni(giorni);

    const somma = (leggi: (t: (typeof giorni)[number]['totali']) => number) =>
      giorni.reduce((acc, g) => acc + leggi(g.totali), 0);

    expect(periodo.netTotalMinor).toBe(20000);
    expect(somma((t) => t.netTotalMinor)).toBe(periodo.netTotalMinor);
    expect(somma((t) => t.netTaxMinor)).toBe(periodo.netTaxMinor);
    expect(somma((t) => t.netTaxableMinor)).toBe(periodo.netTaxableMinor);
    expect(somma((t) => t.totalMinor)).toBe(periodo.totalMinor);
    expect(somma((t) => t.taxMinor)).toBe(periodo.taxMinor);
    expect(somma((t) => t.taxableMinor)).toBe(periodo.taxableMinor);
  });

  /**
   * ⚠️ Il caso che il clamp rompeva, e che ora è raggiungibile in un clic:
   * spuntando i soli Resi una giornata è in perdita.
   */
  it('una giornata in perdita porta il suo segno, e la somma resta giusta', () => {
    const soloRettifiche = {
      ...VUOTE_PER_GIORNO,
      ordini: [venditaDi(G17, 8000, 1440)],
      rettifiche: [{ totalMinor: 20000, taxMinor: 3600, occurredAt: G18 }],
    };

    const giorni = accumulaPerGiorno(soloRettifiche);
    const diciotto = giorni.find((g) => g.giorno === '2026-08-18')!;

    expect(diciotto.totali.netTotalMinor).toBe(-20000);
    expect(diciotto.totali.netTaxableMinor).toBeLessThan(0);
    expect(totaleDaiGiorni(giorni).netTotalMinor).toBe(-12000);
  });

  it('le quattro sorgenti finiscono nella giornata giusta', () => {
    const miste = {
      ...VUOTE_PER_GIORNO,
      ordini: [venditaDi(G18, 10000, 1800)],
      venditeBanco: [{ taxMinor: 180, totalMinor: 1000, occurredAt: G18 }],
      corrispettiviManuali: [
        { subtotalMinor: 2049, taxMinor: 451, totalMinor: 2500, occurredAt: G17 },
      ],
      rettifiche: [{ totalMinor: 500, taxMinor: 90, occurredAt: G17 }],
    };

    const giorni = accumulaPerGiorno(miste);

    expect(giorni.find((g) => g.giorno === '2026-08-18')!.totali.orderCount).toBe(2);
    expect(giorni.find((g) => g.giorno === '2026-08-17')!.totali.orderCount).toBe(1);
    expect(giorni.find((g) => g.giorno === '2026-08-17')!.totali.refundCount).toBe(1);
    expect(totaleDaiGiorni(giorni)).toEqual(accumulaCorrispettivi(miste));
  });

  it('un insieme senza righe non produce giornate', () => {
    expect(accumulaPerGiorno(VUOTE_PER_GIORNO)).toEqual([]);
    expect(totaleDaiGiorni([]).totalMinor).toBe(0);
  });
});
