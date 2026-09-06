import { FormControl } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CURRENCY } from '@core/utils/money.util';

import { DocumentTotalsComponent } from './document-totals.component';
import type { DocumentTotalRow } from './document-totals.model';

function euro(amountMinor: number) {
  return { amountMinor, currencyCode: DEFAULT_CURRENCY };
}

async function apri(rows: readonly DocumentTotalRow[]) {
  return render(DocumentTotalsComponent, { inputs: { rows } });
}

/** Le voci come le legge l'operatore: etichetta e importo, nell'ordine. */
function voci(container: HTMLElement): string[][] {
  return [...container.querySelectorAll('.doc-form__totals-row')].map((riga) => [
    riga.querySelector('dt')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    riga.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  ]);
}

describe('DocumentTotalsComponent', () => {
  it('⭐ rende le voci nell’ordine in cui il documento le dichiara', async () => {
    const view = await apri([
      { key: 'lines', label: 'Imponibile righe', value: euro(10000) },
      { key: 'vat', label: 'IVA', value: euro(2200) },
      { key: 'total', label: 'Totale documento', value: euro(12200), kind: 'total' },
    ]);

    // L'ordine e' del documento: il componente non lo riordina ne' lo completa.
    expect(voci(view.container)).toEqual([
      ['Imponibile righe', '100,00 €'],
      ['IVA', '22,00 €'],
      ['Totale documento', '122,00 €'],
    ]);
  });

  /**
   * ⭐ **Il ruolo della voce diventa una classe, e il foglio la veste.**
   *
   * I tre modificatori esistevano già in `_document-form-footer.scss` prima di
   * questo componente: qui si dichiara quale voce li porta, non come si vedono.
   */
  it('⭐ il ruolo della voce arriva al foglio come modificatore', async () => {
    const view = await apri([
      { key: 'a', label: 'Imponibile righe', value: euro(100) },
      { key: 'b', label: 'Totale documento', value: euro(100), kind: 'total' },
      { key: 'c', label: '22%', value: euro(22), kind: 'info' },
    ]);

    const righe = [...view.container.querySelectorAll('.doc-form__totals-row')];

    expect(righe[0]!.className).toBe('doc-form__totals-row');
    expect(righe[1]!.className).toContain('doc-form__totals-row--total');
    expect(righe[2]!.className).toContain('doc-form__totals-row--info');
  });

  /**
   * ⛔ **Il meno è una rappresentazione, non un calcolo.**
   *
   * Lo sconto documento si memorizza POSITIVO e si mostra in detrazione. Se
   * qualcuno passasse un valore già negativo alzando anche la bandiera, il meno
   * comparirebbe due volte — ed e' il difetto che questa prova impedisce.
   */
  it('⛔ «negative» mette il meno UNA volta, e non tocca il valore', async () => {
    const view = await apri([
      { key: 'sconto', label: 'Sconto documento', value: euro(1500), negative: true },
    ]);

    expect(voci(view.container)).toEqual([['Sconto documento', '−15,00 €']]);
  });

  /**
   * ⛔ **`null` non è zero.**
   *
   * Una voce senza importo è una voce che non ne ha; una voce a zero si
   * dichiara con un importo che vale zero. Confonderli farebbe sparire uno zero
   * legittimo, che in un riepilogo è un'informazione.
   */
  it('⛔ una voce senza importo resta vuota, una a zero mostra zero', async () => {
    const view = await apri([
      { key: 'senza', label: 'Non calcolato', value: null },
      { key: 'zero', label: 'IVA', value: euro(0) },
    ]);

    expect(voci(view.container)).toEqual([
      ['Non calcolato', ''],
      ['IVA', '0,00 €'],
    ]);
  });

  describe('la voce MODIFICABILE', () => {
    it('⭐ al posto dell’importo c’è il campo, legato al controllo', async () => {
      const control = new FormControl('5%', { nonNullable: true });
      await apri([
        {
          key: 'sconto',
          label: 'Sconto extra',
          kind: 'field',
          control,
          inputId: 'tot-sconto',
          placeholder: '0%',
          ariaLabel: 'Sconto extra documento',
        },
      ]);

      const campo = screen.getByLabelText<HTMLInputElement>('Sconto extra documento');

      expect(campo.value).toBe('5%');
      await userEvent.clear(campo);
      await userEvent.type(campo, '10%');
      expect(control.value).toBe('10%');
    });

    it('⭐ e l’etichetta è una «label» vera, agganciata al campo', async () => {
      const control = new FormControl('', { nonNullable: true });
      const view = await apri([
        { key: 'sconto', label: 'Sconto extra', kind: 'field', control, inputId: 'tot-sconto' },
      ]);

      // Senza `for`/`id` il tocco sull'etichetta non porta il fuoco nel campo,
      // e su schermo compatto e' meta' del bersaglio utile.
      const label = view.container.querySelector('label');
      expect(label?.getAttribute('for')).toBe('tot-sconto');
    });

    it('⭐ senza ariaLabel il nome accessibile è l’etichetta della voce', async () => {
      const control = new FormControl('', { nonNullable: true });
      await apri([{ key: 'spese', label: 'Spese', kind: 'field', control, inputId: 'tot-spese' }]);

      // Un campo di riepilogo senza nome sarebbe annunciato «modifica testo».
      expect(screen.getByLabelText('Spese')).toBeTruthy();
    });
  });
});
