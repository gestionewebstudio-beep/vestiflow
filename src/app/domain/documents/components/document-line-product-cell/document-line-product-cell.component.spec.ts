import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import { DocumentLineProductCellComponent } from './document-line-product-cell.component';

/**
 * **Fotografia del comportamento pubblico** prima di aumentare i consumer.
 *
 * La cella nome prodotto è UN campo solo, agganciato o no: il nome scritto sul
 * documento è la descrizione di QUELLA riga, non dell'anagrafica, quindi resta
 * modificabile anche quando l'articolo c'è.
 *
 * ⛔ I test non cambiano la UI e non introducono astrazioni: registrano ciò che
 * il componente promette oggi.
 */
function variante(over: Partial<VariantSummary> = {}): VariantSummary {
  return {
    variantId: 'var-1',
    productId: 'prod-1',
    productName: 'Maglietta cotone',
    optionLabel: 'M · Rosso',
    sku: 'SKU-1',
    barcode: null,
    articleCode: '00001',
    category: null,
    currency: 'EUR',
    sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
    purchasePrice: undefined,
    stockOnHand: null,
    unitOfMeasure: 'pz',
    ...over,
  } as VariantSummary;
}

async function apri(
  inputs: Partial<{
    lineIndex: number;
    inputId: string;
    value: string;
    linked: boolean;
    disabled: boolean;
    invalid: boolean;
    suggestions: readonly VariantSummary[];
    suggestionsOpen: boolean;
    activeSuggestionIndex: number;
  }> = {},
) {
  const spie = {
    valueChange: vi.fn(),
    focused: vi.fn(),
    blurred: vi.fn(),
    searchOpen: vi.fn(),
    suggestionPick: vi.fn(),
    suggestionNavigate: vi.fn(),
    lineAdvance: vi.fn(),
    lineRetreat: vi.fn(),
    lineRowAdvance: vi.fn(),
    lineRowRetreat: vi.fn(),
    escapePressed: vi.fn(),
  };
  const view = await render(DocumentLineProductCellComponent, {
    inputs: { lineIndex: 0, value: '', ...inputs },
    on: spie,
  });
  return { view, ...spie };
}

function campo(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Nome prodotto' });
}

describe('DocumentLineProductCellComponent', () => {
  describe('il campo', () => {
    it('porta l’id che riceve: il giro del fuoco lo raggiunge', async () => {
      await apri({ inputId: 'gr-product-2' });

      expect(campo().id).toBe('gr-product-2');
    });

    /**
     * ⛔ **Difetto trovato da questa rete, fotografato e NON corretto.**
     *
     * Il template scrive `[id]="inputId() || null"`, e in Angular quel `null`
     * finisce nell’attributo come **stringa** `'null'`: senza `inputId` il campo
     * non resta senza id, ne prende uno che vale `null`. Due celle senza id
     * sulla stessa pagina avrebbero lo stesso identificativo.
     *
     * Oggi non morde: i consumer passano sempre un `inputId`. Il test registra
     * il comportamento corrente perché la correzione — `[attr.id]` — è una
     * modifica di UI, e questa rete serve a congelare, non a cambiare.
     */
    it('senza id l’attributo vale la stringa «null», non è assente', async () => {
      await apri();

      expect(campo().getAttribute('id')).toBe('null');
    });

    it('mostra il valore che riceve, e lo ripete nel title per il testo troncato', async () => {
      await apri({ value: 'Maglietta cotone a maniche lunghe' });

      expect(campo().value).toBe('Maglietta cotone a maniche lunghe');
      expect(campo().title).toBe('Maglietta cotone a maniche lunghe');
    });

    /** Il nome resta modificabile anche a riga agganciata: è la descrizione di quella riga. */
    it('a riga agganciata resta un campo scrivibile', async () => {
      const { valueChange } = await apri({ linked: true, value: 'Maglietta' });

      expect(campo().disabled).toBe(false);
      await userEvent.type(campo(), '!');
      expect(valueChange).toHaveBeenCalled();
    });

    it('disabilitata non accetta battute', async () => {
      const { valueChange } = await apri({ disabled: true });

      expect(campo().disabled).toBe(true);
      await userEvent.type(campo(), 'X');
      expect(valueChange).not.toHaveBeenCalled();
    });

    it('non valida si dichiara a chi ascolta', async () => {
      await apri({ invalid: true });

      expect(campo().getAttribute('aria-invalid')).toBe('true');
    });

    it('valida non porta l’attributo: assente, non "false"', async () => {
      await apri();

      expect(campo().getAttribute('aria-invalid')).toBeNull();
    });
  });

  describe('gli eventi che consegna al chiamante', () => {
    it('ogni battuta esce come valore', async () => {
      const { valueChange } = await apri();

      await userEvent.type(campo(), 'Ma');

      expect(valueChange).toHaveBeenLastCalledWith('Ma');
    });

    it('fuoco e sfocamento portano l’indice di riga', async () => {
      const { focused, blurred } = await apri({ lineIndex: 3 });

      campo().focus();
      expect(focused).toHaveBeenCalledWith(3);

      campo().blur();
      expect(blurred).toHaveBeenCalledWith(3);
    });

    it('la lente chiede la ricerca col proprio indice, senza spostare il fuoco', async () => {
      const { searchOpen } = await apri({ lineIndex: 5 });

      await userEvent.click(screen.getByRole('button', { name: 'Cerca prodotto' }));

      expect(searchOpen).toHaveBeenCalledWith(5);
    });

    it('a riga agganciata la lente cambia nome: cerca un ALTRO prodotto', async () => {
      await apri({ linked: true });

      expect(screen.getByRole('button', { name: 'Cerca un altro prodotto' })).toBeVisible();
    });
  });

  describe('il pannello dei suggerimenti', () => {
    it('senza suggerimenti non si apre, anche se aperto è richiesto', async () => {
      await apri({ suggestionsOpen: true, suggestions: [] });

      // Non trovare nulla non è un errore: si continua a compilare a mano.
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('con suggerimenti aperti il campo lo dichiara a chi ascolta', async () => {
      await apri({ suggestionsOpen: true, suggestions: [variante()] });

      expect(campo().getAttribute('aria-expanded')).toBe('true');
      expect(campo().getAttribute('aria-controls')).toBe(
        screen.getByRole('listbox').getAttribute('id'),
      );
    });

    it('scegliere un suggerimento consegna riga e variante insieme', async () => {
      const { suggestionPick } = await apri({
        lineIndex: 2,
        suggestionsOpen: true,
        suggestions: [variante({ variantId: 'var-9' })],
      });

      await userEvent.click(screen.getAllByRole('option')[0]!);

      expect(suggestionPick).toHaveBeenCalledWith({ lineIndex: 2, variantId: 'var-9' });
    });
  });

  describe('la navigazione', () => {
    it('↓ e ↑ escono come cambio di riga col proprio indice', async () => {
      const { lineRowAdvance, lineRowRetreat } = await apri({ lineIndex: 4 });

      campo().focus();
      await userEvent.keyboard('{ArrowDown}');
      expect(lineRowAdvance).toHaveBeenCalledWith(4);

      await userEvent.keyboard('{ArrowUp}');
      expect(lineRowRetreat).toHaveBeenCalledWith(4);
    });

    /** Col pannello aperto le frecce scorrono l'elenco, non cambiano riga. */
    it('col pannello aperto ↓ scorre i suggerimenti invece di cambiare riga', async () => {
      const { suggestionNavigate, lineRowAdvance } = await apri({
        suggestionsOpen: true,
        suggestions: [variante(), variante({ variantId: 'var-2' })],
      });

      campo().focus();
      await userEvent.keyboard('{ArrowDown}');

      expect(suggestionNavigate).toHaveBeenCalled();
      expect(lineRowAdvance).not.toHaveBeenCalled();
    });

    it('Esc esce col proprio indice', async () => {
      const { escapePressed } = await apri({ lineIndex: 1 });

      campo().focus();
      await userEvent.keyboard('{Escape}');

      expect(escapePressed).toHaveBeenCalledWith(1);
    });
  });
});
