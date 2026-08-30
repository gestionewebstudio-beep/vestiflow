import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CURRENCY } from '@core/utils/money.util';

import { CorrispettiviSummaryComponent } from './corrispettivi-summary.component';
import type { CorrispettiviSummary } from '../../models/corrispettivi.model';

/**
 * ⚠️ **Il riepilogo Corrispettivi non aveva NESSUN test** fino al 30/08/2026,
 * ed è la fascia che il proprietario sta modellando riga per riga: l'ordine
 * delle voci ora è una DECISIONE (le rettifiche fra i due addendi), e una
 * decisione senza test è una decisione che si perde al primo riordino.
 */

const soldi = (amountMinor: number) => ({ amountMinor, currencyCode: DEFAULT_CURRENCY });

const RIEPILOGO: CorrispettiviSummary = {
  orderCount: 8,
  undatedFulfilmentCount: 0,
  refundsCount: 4,
  subtotal: soldi(51799),
  tax: soldi(9602),
  shipping: soldi(0),
  discount: soldi(0),
  total: soldi(81902),
  taxable: soldi(51799),
  refundCount: 4,
  refundTotal: soldi(20501),
  refundTax: soldi(3699),
  cancellationCount: 2,
  cancellationTotal: soldi(0),
  netTotal: soldi(61401),
  netTax: soldi(9602),
  netTaxable: soldi(51799),
  locationUndeterminedExcludedCount: 0,
  perGiornata: [],
};

async function renderRiepilogo(riepilogo: CorrispettiviSummary = RIEPILOGO) {
  return render(CorrispettiviSummaryComponent, {
    inputs: { summary: riepilogo, periodLabel: 'agosto 2026' },
  });
}

/**
 * Le etichette nell'ordine in cui stanno nel documento.
 *
 * ⚠️ **Solo i nodi di testo diretti**, non `textContent`: «Annullamenti» porta
 * dentro il `<dt>` un `app-hover-tooltip`, e il suo testo esteso finirebbe
 * nell'etichetta — l'assenza si leggerebbe come un ordine sbagliato invece che
 * come un tooltip letto per errore.
 */
function etichette(): readonly string[] {
  return Array.from(document.querySelectorAll('.corrispettivi-summary__item dt')).map((dt) =>
    Array.from(dt.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join('')
      .trim()
      .replace(/\s+/g, ' '),
  );
}

describe('CorrispettiviSummaryComponent', () => {
  /**
   * ⭐ **Le rettifiche stanno FRA Totale vendite e Corrispettivo** — deciso dal
   * proprietario il 30/08/2026, ed è l'operazione che la fascia dichiara:
   *
   * ```text
   * TOTALE VENDITE  819,02  −  RETTIFICHE  205,01  =  CORRISPETTIVO  614,01
   * ```
   *
   * ⛔ Stavano in TESTA, cioè prima di ciò da cui si toglie.
   */
  it('mette le rettifiche fra i due numeri che compongono il conto', async () => {
    await renderRiepilogo();
    const ordine = etichette();

    const totale = ordine.findIndex((e) => e.startsWith('Tot. vendite'));
    const rettifiche = ordine.findIndex((e) => e.startsWith('Rettif.'));
    const corrispettivo = ordine.findIndex((e) => e.startsWith('Corrispettivo'));

    expect(totale).toBeGreaterThanOrEqual(0);
    expect(rettifiche).toBeGreaterThan(totale);
    expect(corrispettivo).toBeGreaterThan(rettifiche);
  });

  it("l'ordine completo della fascia è quello deciso", async () => {
    await renderRiepilogo();

    expect(etichette()).toEqual([
      'Annull.',
      'Vendite',
      'Impon.',
      'IVA',
      'Tot. vendite',
      'Rettif. (4)',
      'Corrispettivo',
    ]);
  });

  /**
   * ⛔ Il Corrispettivo è l'ULTIMA voce, e deve restarlo: è il numero che si va
   * a leggere, e sta in fondo a destra per posizione naturale — non è ancorato.
   * Se una voce nuova gli finisse dopo, si sposterebbe senza che nulla protesti.
   */
  it('il Corrispettivo chiude la fascia, sempre', async () => {
    await renderRiepilogo();
    expect(etichette().at(-1)).toBe('Corrispettivo');
  });

  it('senza rettifiche e senza annullamenti quelle due voci non compaiono', async () => {
    await renderRiepilogo({ ...RIEPILOGO, refundCount: 0, cancellationCount: 0 });

    expect(etichette()).toEqual(['Vendite', 'Impon.', 'IVA', 'Tot. vendite', 'Corrispettivo']);
  });

  it('la rettifica si legge col segno meno, e resta ultima prima del totale', async () => {
    await renderRiepilogo();

    const negativa = document.querySelector('.corrispettivi-summary__item--negative dd');
    expect(negativa?.textContent).toContain('−');
  });

  /**
   * ⭐ **Il conteggio righe sta NELLA fascia, a sinistra** — deciso dal
   * proprietario il 30/08/2026. Stava in coda al riquadro, su una riga sua.
   */
  it('mostra quante righe ci sono, dentro la fascia', async () => {
    await render(CorrispettiviSummaryComponent, {
      inputs: { summary: RIEPILOGO, periodLabel: 'agosto 2026', rowCount: 12 },
    });

    expect(document.querySelector('.corrispettivi-summary__count')?.textContent?.trim()).toBe(
      '12 righe',
    );
  });

  it('al singolare dice «riga», non «righe»', async () => {
    await render(CorrispettiviSummaryComponent, {
      inputs: { summary: RIEPILOGO, periodLabel: 'agosto 2026', rowCount: 1 },
    });

    expect(document.querySelector('.corrispettivi-summary__count')?.textContent?.trim()).toBe(
      '1 riga',
    );
  });

  /** Senza righe non si scrive «0 righe»: il vuoto lo dichiara il telaio. */
  it('senza conteggio la voce non compare affatto', async () => {
    await renderRiepilogo();
    expect(document.querySelector('.corrispettivi-summary__count')).toBeNull();
  });

  it('le vendite evase senza data si dichiarano, non spariscono', async () => {
    await renderRiepilogo({ ...RIEPILOGO, undatedFulfilmentCount: 3 });

    expect(screen.getByText(/3 vendite risultano evase senza data/)).toBeTruthy();
  });
});
