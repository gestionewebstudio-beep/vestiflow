import { FormControl, FormGroup } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentLineRowComponent } from './document-line-row.component';
import {
  DOCUMENT_LINE_ROW_VIEW_VUOTA,
  type DocumentLineColumnId,
  type DocumentLineRowView,
} from './document-line-row.model';

/**
 * **Fotografia del comportamento pubblico della riga condivisa**, scritta prima
 * di aumentare i consumer.
 *
 * Oggi la usano due maschere su otto — Ordine cliente e Vendita/Reso al banco —
 * e portarne altre sei senza rete significherebbe scoprire le regressioni a
 * schermo, una per volta.
 *
 * ⭐ Il modello che questi test presidiano: **la riga non sa che documento sta
 * mostrando**. Le differenze arrivano come dati — quali colonne, che etichetta
 * ha la casella magazzino, qual è il minimo della quantità, se si può duplicare.
 *
 * ⛔ I test non cambiano la UI e non introducono astrazioni: registrano ciò che
 * il componente promette oggi.
 */
function gruppoRiga(): FormGroup {
  return new FormGroup({
    articleCode: new FormControl(''),
    sku: new FormControl(''),
    barcode: new FormControl(''),
    productName: new FormControl(''),
    quantity: new FormControl(1),
    unitPrice: new FormControl(''),
    discount: new FormControl(''),
    commitsStock: new FormControl(true),
    serialNumbersText: new FormControl(''),
  });
}

function vista(over: Partial<DocumentLineRowView> = {}): DocumentLineRowView {
  return { ...DOCUMENT_LINE_ROW_VIEW_VUOTA, ...over };
}

type Inputs = Partial<{
  group: FormGroup;
  lineIndex: number;
  isColumnVisible: (column: DocumentLineColumnId) => boolean;
  idPrefix: string;
  view: DocumentLineRowView;
  readOnly: boolean;
  unitOptions: readonly { value: string; label: string }[];
  stockToggleLabel: string;
  identityColumnCount: number;
  dragHandle: boolean;
  canDuplicate: boolean;
  quantityMin: number;
}>;

async function apri(inputs: Inputs = {}) {
  const spie = {
    codeChanged: vi.fn(),
    codeFocused: vi.fn(),
    codeBlurred: vi.fn(),
    codeCommitted: vi.fn(),
    productNameChanged: vi.fn(),
    productFocused: vi.fn(),
    productBlurred: vi.fn(),
    productSearchOpened: vi.fn(),
    suggestionPicked: vi.fn(),
    suggestionNavigated: vi.fn(),
    escapePressed: vi.fn(),
    unitChanged: vi.fn(),
    unitManageRequested: vi.fn(),
    vatSelected: vi.fn(),
    fieldKeydown: vi.fn(),
    fieldAdvance: vi.fn(),
    fieldRetreat: vi.fn(),
    rowAdvance: vi.fn(),
    rowRetreat: vi.fn(),
    duplicateRequested: vi.fn(),
    removeRequested: vi.fn(),
  };
  const view = await render(DocumentLineRowComponent, {
    inputs: {
      group: gruppoRiga(),
      lineIndex: 0,
      isColumnVisible: () => true,
      idPrefix: 'co',
      view: vista(),
      ...inputs,
    },
    on: spie,
  });
  return { view, ...spie };
}

const q = (id: string): HTMLInputElement | null =>
  document.querySelector<HTMLInputElement>(`#${id}`);

describe('DocumentLineRowComponent', () => {
  describe('la visibilità delle colonne è decisa dal chiamante', () => {
    it('con tutte visibili rende le celle note', async () => {
      await apri();

      expect(q('co-code-0')).not.toBeNull();
      expect(q('co-sku-0')).not.toBeNull();
      expect(q('co-barcode-0')).not.toBeNull();
      expect(q('co-product-0')).not.toBeNull();
      expect(q('co-qty-0')).not.toBeNull();
    });

    it('una colonna nascosta non è nel DOM, non è solo invisibile', async () => {
      await apri({ isColumnVisible: (c) => c !== 'sku' && c !== 'barcode' });

      expect(q('co-sku-0')).toBeNull();
      expect(q('co-barcode-0')).toBeNull();
      expect(q('co-code-0')).not.toBeNull();
    });

    /** L'id porta il prefisso del chiamante: è ciò che lega la riga al giro del fuoco. */
    it('gli id nascono da prefisso e indice di riga', async () => {
      await apri({ idPrefix: 'ss', lineIndex: 3 });

      expect(q('ss-qty-3')).not.toBeNull();
      expect(q('co-qty-0')).toBeNull();
    });
  });

  /**
   * ⚠️ **Il contratto reale della sola lettura, e non è quello che sembra.**
   *
   * `readOnly` disabilita **solo le celle che lo leggono** — U.M. e IVA, che
   * ricevono `[disabled]="readOnly()"`. I campi legati con `formControlName`
   * (quantità, sconto, prezzo, casella magazzino, seriali) seguono invece lo
   * stato del **proprio `FormControl`**: chi mette il documento in sola lettura
   * deve disabilitare il gruppo, non basta l’input della riga.
   *
   * Non è un difetto — è come Angular lega i controlli — ma è un contratto a
   * due facce, e un consumer nuovo che passasse solo `readOnly` avrebbe metà
   * riga ancora scrivibile. Il test lo dichiara perché non si scopra a schermo.
   */
  describe('sola lettura', () => {
    it('disabilita le celle che la leggono (U.M., IVA)', async () => {
      await apri({ readOnly: true, unitOptions: [{ value: 'pz', label: 'pz' }] });

      const celle = screen.getAllByRole('textbox', { name: /Unità di misura|IVA/ });
      expect(celle.length).toBeGreaterThan(0);
      for (const cella of celle) {
        expect((cella as HTMLInputElement).disabled).toBe(true);
      }
    });

    it('NON disabilita da sola i campi con formControlName: quelli seguono il gruppo', async () => {
      await apri({ readOnly: true });

      expect(q('co-qty-0')?.disabled).toBe(false);
    });

    it('col gruppo disabilitato i campi si spengono davvero', async () => {
      const gruppo = gruppoRiga();
      gruppo.disable();

      await apri({ group: gruppo, readOnly: true });

      expect(q('co-qty-0')?.disabled).toBe(true);
    });
  });

  /**
   * ⭐ La differenza fra «impegna», «carica» e «scarica» entra come ETICHETTA.
   * È il punto su cui poggia tutta la strategia di estensione: stessa primitiva
   * visuale, campi di dominio distinti.
   */
  describe('la casella magazzino è parametrizzata', () => {
    it('senza indicazioni si chiama «Impegna magazzino»', async () => {
      await apri();

      expect(screen.getByText('Impegna magazzino')).toBeInTheDocument();
    });

    it('il chiamante le dà il proprio nome, e la riga non chiede perché', async () => {
      await apri({ stockToggleLabel: 'Carica magazzino' });

      expect(screen.getByText('Carica magazzino')).toBeInTheDocument();
      expect(screen.queryByText('Impegna magazzino')).toBeNull();
    });
  });

  describe('quantità', () => {
    it('il minimo arriva dal chiamante', async () => {
      await apri({ quantityMin: 1 });

      expect(q('co-qty-0')?.getAttribute('min')).toBe('1');
    });

    it('senza indicazioni il minimo è zero', async () => {
      await apri();

      expect(q('co-qty-0')?.getAttribute('min')).toBe('0');
    });
  });

  describe('duplica e rimuovi', () => {
    it('senza permesso di duplicare il comando non c’è', async () => {
      await apri();

      expect(screen.queryByRole('button', { name: /Duplica/i })).toBeNull();
    });

    it('col permesso il comando c’è e chiede la duplicazione', async () => {
      const { duplicateRequested } = await apri({ canDuplicate: true });

      await userEvent.click(screen.getByRole('button', { name: /Duplica/i }));

      expect(duplicateRequested).toHaveBeenCalledTimes(1);
    });

    it('il cestino chiede la rimozione: la riga non si toglie da sola', async () => {
      const { removeRequested } = await apri();

      await userEvent.click(screen.getByRole('button', { name: /Rimuovi/i }));

      expect(removeRequested).toHaveBeenCalledTimes(1);
    });
  });

  describe('la riga di riferimento a un documento collegato', () => {
    it('non rende i campi della riga normale', async () => {
      await apri({ view: vista({ isReference: true }) });

      // Niente quantità, niente prezzi: è una fascia col solo titolo.
      expect(q('co-qty-0')).toBeNull();
    });

    it('e non offre la duplicazione, nemmeno se concessa', async () => {
      await apri({ view: vista({ isReference: true }), canDuplicate: true });

      expect(screen.queryByRole('button', { name: /Duplica/i })).toBeNull();
    });
  });

  describe('gli eventi di cella escono verso il chiamante', () => {
    it('il nome prodotto esce come valore', async () => {
      const { productNameChanged } = await apri();

      await userEvent.type(q('co-product-0')!, 'Ma');

      expect(productNameChanged).toHaveBeenLastCalledWith('Ma');
    });

    it('il fuoco sul nome prodotto esce, e lo sfocamento pure', async () => {
      const { productFocused, productBlurred } = await apri();

      q('co-product-0')!.focus();
      expect(productFocused).toHaveBeenCalled();

      q('co-product-0')!.blur();
      expect(productBlurred).toHaveBeenCalled();
    });

    it('una cella codice esce col proprio campo, non con un evento anonimo', async () => {
      const { codeChanged } = await apri();

      await userEvent.type(q('co-sku-0')!, 'A');

      expect(codeChanged).toHaveBeenCalled();
      expect(codeChanged.mock.calls.at(-1)?.[0]).toMatchObject({ field: 'sku' });
    });

    it('il fuoco su una cella codice dice QUALE codice', async () => {
      const { codeFocused } = await apri();

      q('co-barcode-0')!.focus();

      expect(codeFocused).toHaveBeenCalledWith('barcode');
    });
  });

  describe('la navigazione esce verso il chiamante', () => {
    it('un tasto su un campo esce col campo da cui parte', async () => {
      const { fieldKeydown } = await apri();

      q('co-qty-0')!.focus();
      await userEvent.keyboard('{Tab}');

      expect(fieldKeydown).toHaveBeenCalled();
      expect(fieldKeydown.mock.calls.at(-1)?.[0]).toMatchObject({ field: 'quantity' });
    });

    it('↓ da una cella condivisa esce come cambio riga', async () => {
      const { rowAdvance } = await apri();

      q('co-product-0')!.focus();
      await userEvent.keyboard('{ArrowDown}');

      expect(rowAdvance).toHaveBeenCalled();
    });
  });

  describe('i valori calcolati arrivano già formattati', () => {
    it('la riga li mostra e non li ricalcola', async () => {
      await apri({
        view: vista({ lineTotal: '253,28 €', stockAvailable: '7', discountedPrice: '84,43 €' }),
      });

      expect(screen.getByText('253,28 €')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getByText('84,43 €')).toBeInTheDocument();
    });

    it('senza sconto il totale lordo non si mostra', async () => {
      await apri({ view: vista({ lineTotal: '100,00 €', grossTotal: null }) });

      expect(screen.queryByText('120,00 €')).toBeNull();
    });
  });

  describe('un gruppo senza tutti i controlli non fa cadere la riga', () => {
    it('una maschera che non ha una colonna non deve dichiararne il controllo', async () => {
      const scarno = new FormGroup({
        productName: new FormControl(''),
        quantity: new FormControl(1),
      });

      await apri({ group: scarno, isColumnVisible: (c) => c === 'product' || c === 'quantity' });

      expect(q('co-product-0')).not.toBeNull();
      expect(q('co-qty-0')).not.toBeNull();
    });
  });
});
