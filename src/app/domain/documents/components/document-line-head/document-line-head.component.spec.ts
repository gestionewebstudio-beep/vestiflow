import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentLineColumnId } from '../document-line-row/document-line-row.model';
import {
  DocumentLineHeadComponent,
  type DocumentLineSortDirection,
} from './document-line-head.component';

/**
 * **Fotografia del comportamento pubblico** prima di aumentare i consumer.
 *
 * L'intestazione è il gemello della riga: rende le stesse colonne, e le sue
 * differenze fra documenti arrivano **come dati** — l'etichetta della colonna
 * magazzino e quella del prezzo sono `input()`, non `if` sul tipo documento.
 *
 * ⛔ I test non cambiano la UI: registrano ciò che il componente promette oggi.
 */
type Inputs = Partial<{
  isColumnVisible: (column: DocumentLineColumnId) => boolean;
  columnWidth: (column: DocumentLineColumnId) => string;
  columnMinWidth: (column: DocumentLineColumnId) => number;
  sortable: boolean;
  sortColumn: string | null;
  sortDirection: DocumentLineSortDirection;
  sortAvailable: boolean;
  sortDisabledReason: string | null;
  stockToggleLabel: string;
  loadToggleLabel: string;
  loadToggleTooltip: string;
  stockToggleTooltip: string;
  priceLabel: string;
  pricesIncludeVat: boolean;
  priceMenuOpen: boolean;
  readOnly: boolean;
}>;

async function apri(inputs: Inputs = {}) {
  const spie = {
    sortToggled: vi.fn(),
    columnResizing: vi.fn(),
    columnResized: vi.fn(),
    priceMenuToggled: vi.fn(),
    priceModeChanged: vi.fn(),
  };
  const view = await render(DocumentLineHeadComponent, {
    inputs: {
      isColumnVisible: () => true,
      columnWidth: () => 'auto',
      columnMinWidth: () => 40,
      ...inputs,
    },
    on: spie,
  });
  return { view, ...spie };
}

describe('DocumentLineHeadComponent', () => {
  describe('la visibilità delle colonne è decisa dal chiamante', () => {
    it('con tutte visibili rende le intestazioni note', async () => {
      await apri();

      for (const testo of ['Cod. articolo', 'SKU', 'EAN', 'Articolo', 'Q.tà', 'IVA', 'Totale']) {
        expect(screen.getByText(testo)).toBeVisible();
      }
    });

    it('una colonna nascosta non è nel DOM, non è solo invisibile', async () => {
      await apri({ isColumnVisible: (c) => c !== 'sku' && c !== 'barcode' });

      expect(screen.queryByText('SKU')).toBeNull();
      expect(screen.queryByText('EAN')).toBeNull();
      // Le altre restano.
      expect(screen.getByText('Cod. articolo')).toBeVisible();
    });

    it('con nessuna colonna visibile resta comunque una testata', async () => {
      await apri({ isColumnVisible: () => false });

      // Il numero riga e le azioni non passano dal selettore: la riga esiste
      // sempre, anche svestita.
      expect(document.querySelectorAll('th').length).toBeGreaterThan(0);
    });
  });

  /**
   * ⭐ La differenza fra «impegna», «carica» e «scarica» entra come ETICHETTA,
   * non come condizionale di documento: è il modello che questa rete presidia.
   */
  describe('la colonna magazzino è parametrizzata', () => {
    /**
     * ⛔ **Le colonne di magazzino sono DUE, e vanno tenute distinte.**
     *
     *   commitsStock   «impegna» — la merce resta, ma è promessa a qualcuno
     *   loadsStock     «carica»/«scarica» — la merce si muove davvero
     *
     * Il test le rende entrambe (`isColumnVisible: () => true`), quindi ogni
     * asserzione deve dire di QUALE parla: prima condividevano l'etichetta, e
     * `getByText` ne trovava due.
     */
    it('senza indicazioni si chiamano «Impegna magazzino» e «Carica magazzino»', async () => {
      await apri();

      expect(screen.getByText('Impegna magazzino')).toBeVisible();
      expect(screen.getByText('Carica magazzino')).toBeVisible();
    });

    it('il chiamante dà a ciascuna il proprio nome', async () => {
      await apri({ stockToggleLabel: 'Impegna scorta', loadToggleLabel: 'Scarica giacenze' });

      expect(screen.getByText('Impegna scorta')).toBeVisible();
      expect(screen.getByText('Scarica giacenze')).toBeVisible();
      expect(screen.queryByText('Impegna magazzino')).toBeNull();
      expect(screen.queryByText('Carica magazzino')).toBeNull();
    });

    it('senza spiegazione non compare l’icona informativa', async () => {
      await apri({ stockToggleLabel: 'Scarica mag.' });

      expect(screen.queryByLabelText(/^Info colonna/)).toBeNull();
    });

    it('con la spiegazione l’icona la porta, e nomina la colonna', async () => {
      await apri({ stockToggleLabel: 'Impegna mag.', stockToggleTooltip: 'Prenota la giacenza' });

      expect(screen.getByLabelText('Info colonna Impegna mag.')).toBeVisible();
    });

    it('e la spiegazione dell’altra colonna è sua', async () => {
      await apri({ loadToggleLabel: 'Scarica mag.', loadToggleTooltip: 'Movimenta la giacenza' });

      expect(screen.getByLabelText('Info colonna Scarica mag.')).toBeVisible();
      // ⛔ Quella di «impegna» non compare: le due spiegazioni sono separate.
      expect(screen.queryByLabelText('Info colonna Impegna magazzino')).toBeNull();
    });
  });

  /**
   * ⛔ **Difetto trovato da questa rete, fotografato e NON corretto.**
   *
   * Nella testata ci sono **due** comandi con lo stesso nome accessibile
   * «Modalità prezzo del documento»: il trigger dell’intestazione e quello
   * dentro `app-price-mode-menu`, che riceve lo stesso `ariaLabel`. Chi ascolta
   * ne sente due identici e non sa quale apre cosa.
   *
   * I test usano il PRIMO — il trigger — e la sua posizione è essa stessa parte
   * della fotografia: se un domani i due si distinguessero, questi test lo
   * direbbero.
   */
  describe('la colonna prezzo e la sua modalità', () => {
    /** Il trigger dell’intestazione: il primo dei due omonimi. */
    function triggerPrezzo(): HTMLElement {
      return screen.getAllByRole('button', { name: 'Modalità prezzo del documento' })[0]!;
    }

    it('porta l’etichetta che riceve', async () => {
      await apri({ priceLabel: 'Prezzo ivato' });

      expect(triggerPrezzo()).toHaveTextContent('Prezzo ivato');
    });

    it('il comando chiede l’apertura del menu, non lo decide da sé', async () => {
      const { priceMenuToggled } = await apri();

      await userEvent.click(triggerPrezzo());

      expect(priceMenuToggled).toHaveBeenCalledTimes(1);
    });

    it('dichiara a chi ascolta se il menu è aperto', async () => {
      const { view } = await apri({ priceMenuOpen: true });

      expect(triggerPrezzo().getAttribute('aria-expanded')).toBe('true');

      await view.rerender({
        inputs: {
          isColumnVisible: () => true,
          columnWidth: () => 'auto',
          columnMinWidth: () => 40,
          priceMenuOpen: false,
        },
      });

      expect(triggerPrezzo().getAttribute('aria-expanded')).toBe('false');
    });

    it('i due comandi si distinguono: nessun nome accessibile doppio', async () => {
      await apri();

      expect(screen.getAllByRole('button', { name: 'Modalità prezzo del documento' })).toHaveLength(
        1,
      );
      expect(screen.getByRole('button', { name: 'Scegli la modalità prezzo' })).toBeVisible();
    });
  });

  describe('l’ordinamento', () => {
    it('cliccare un’intestazione ordinabile chiede l’ordinamento di quella colonna', async () => {
      const { sortToggled } = await apri({ sortable: true });

      await userEvent.click(screen.getByText('Cod. articolo'));

      expect(sortToggled).toHaveBeenCalledWith('articleCode');
    });

    it('non ordinabile: il clic non chiede nulla', async () => {
      const { sortToggled } = await apri({ sortable: false });

      await userEvent.click(screen.getByText('Cod. articolo'));

      expect(sortToggled).not.toHaveBeenCalled();
    });
  });
});
