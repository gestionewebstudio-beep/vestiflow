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
   * ⭐ **L'ordine del DOM è quello del TELEFONO** — 30/08/2026, seconda stesura.
   *
   * Le rettifiche chiudono la banda dei CONTEGGI, prima degli importi: è la
   * forma del mockup, ed è l'unica in cui «Rettifiche (4) − 205,01 €» ci sta a
   * 320px senza rimpicciolire niente — misurato, chiede 169px contro i 70 di
   * una colonna.
   *
   * ⚠️ **Su scrivania le rettifiche stanno FRA i due addendi**, come deciso lo
   * stesso giorno: `TOT. VENDITE − RETTIFICHE = CORRISPETTIVO`. Ci arrivano con
   * due dichiarazioni `order` dentro `media-up('lg')`.
   *
   * ⛔ **Quell'ordine NON è verificabile qui**, ed è una lacuna dichiarata: i
   * test di componente girano in jsdom, che non applica i fogli di stile del
   * componente né calcola il layout. Si vede solo a schermo.
   */
  it('sul DOM le rettifiche chiudono i conteggi, prima degli importi', async () => {
    await renderRiepilogo();
    const ordine = etichette();

    const rettifiche = ordine.findIndex((e) => e.startsWith('Rettifiche'));
    const imponibile = ordine.findIndex((e) => e.startsWith('Imponibile'));
    const corrispettivo = ordine.findIndex((e) => e.startsWith('Corrispettivo'));

    expect(rettifiche).toBeGreaterThanOrEqual(0);
    expect(imponibile).toBeGreaterThan(rettifiche);
    expect(corrispettivo).toBeGreaterThan(imponibile);
  });

  /**
   * ⭐ **Le due bande esistono nel DOM**, e non sono una veste: sono ciò che
   * permette alla prima di andare a capo senza trascinarsi dietro la seconda.
   */
  it('le voci stanno in due bande distinte', async () => {
    await renderRiepilogo();

    const conteggi = document.querySelector('.corrispettivi-summary__band--stats');
    const importi = document.querySelector('.corrispettivi-summary__band--money');

    expect(conteggi).not.toBeNull();
    expect(importi).not.toBeNull();
    // Gli importi sono quattro: imponibile, IVA, totale vendite, corrispettivo.
    expect(importi!.querySelectorAll('.corrispettivi-summary__item').length).toBe(4);
  });

  it("l'ordine completo della fascia è quello deciso", async () => {
    await renderRiepilogo();

    expect(etichette()).toEqual([
      'Annullamenti',
      'Vendite',
      'Rettifiche (4)',
      'Imponibile',
      'IVA',
      'Tot. vendite',
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

    expect(etichette()).toEqual(['Vendite', 'Imponibile', 'IVA', 'Tot. vendite', 'Corrispettivo']);
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
