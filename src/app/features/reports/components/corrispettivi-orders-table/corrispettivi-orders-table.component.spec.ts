import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CorrispettiviRegisterRow } from '../../models/corrispettivi.model';
import { CorrispettiviOrdersTableComponent } from './corrispettivi-orders-table.component';

/**
 * Come si apre una riga del Registro (17/08/2026).
 *
 * ⚠️ **Il varco era il numero sottolineato**, e nessuno poteva indovinarlo: in
 * una colonna dove «#1009» non fa niente, «2» si apriva. Ora vale il pattern
 * della casa — riga intera, come `document-table` — e questi test presidiano
 * l'unica parte che non si vede a occhio: che il mouse e la tastiera aprano le
 * **stesse** righe, e che le altre tre sorgenti non prendano un'apertura che
 * non hanno dove portare.
 */

function riga(over: Partial<CorrispettiviRegisterRow> = {}): CorrispettiviRegisterRow {
  return {
    rowId: 'manual:r1',
    kind: 'sale',
    manualReceiptId: 'mr-1',
    orderNumber: '2',
    occurredAt: '2026-08-17',
    source: 'manual_receipt',
    customerName: '',
    currency: 'EUR',
    taxable: { amountMinor: 29344, currencyCode: 'EUR' },
    tax: { amountMinor: 6456, currencyCode: 'EUR' },
    total: { amountMinor: 35800, currencyCode: 'EUR' },
    ...over,
  };
}

/** La riga di una sorgente che una maschera non ce l'ha. */
const rigaShopify = riga({
  rowId: 'sale:s1',
  manualReceiptId: undefined,
  orderNumber: '#1009',
  source: 'shopify_online',
});

async function montaTabella(rows: readonly CorrispettiviRegisterRow[], canEditManual = true) {
  const aperta = vi.fn();
  await render(CorrispettiviOrdersTableComponent, {
    inputs: { rows, canEditManual },
    on: { manualReceiptOpened: aperta },
  });
  return aperta;
}

describe('riga cliccabile del Registro', () => {
  it('il clic sulla riga di un corrispettivo manuale la apre', async () => {
    const aperta = await montaTabella([riga()]);

    await userEvent.click(screen.getByLabelText('Apri il corrispettivo manuale n. 2'));

    expect(aperta).toHaveBeenCalledWith('mr-1');
  });

  it('Invio apre la stessa riga del clic', async () => {
    const aperta = await montaTabella([riga()]);

    const target = screen.getByLabelText('Apri il corrispettivo manuale n. 2');
    target.focus();
    await userEvent.keyboard('{Enter}');

    expect(aperta).toHaveBeenCalledWith('mr-1');
  });

  /**
   * ⚠️ Senza `preventDefault` lo Spazio apre **e** fa scorrere la pagina sotto
   * la maschera che si sta aprendo. È il motivo per cui `document-table` lo
   * tratta a parte, e per cui non basta ripetere il gestore di Invio.
   */
  it('Spazio apre la riga senza far scorrere la pagina', async () => {
    const aperta = await montaTabella([riga()]);

    const target = screen.getByLabelText('Apri il corrispettivo manuale n. 2');
    target.focus();
    await userEvent.keyboard(' ');

    expect(aperta).toHaveBeenCalledWith('mr-1');
  });

  it('le righe delle altre sorgenti non si aprono e non entrano nel giro del fuoco', async () => {
    const aperta = await montaTabella([rigaShopify]);

    // Nessuna etichetta di apertura: non c'è niente da aprire.
    expect(screen.queryByLabelText(/Apri il corrispettivo manuale/)).toBeNull();

    // `selector: 'td'` mira alla CELLA, non alla card mobile che ripete lo
    // stesso numero: sotto lg la riga ha due vesti, e i dati sono le colonne.
    const cella = screen.getByText('#1009', { selector: 'td' });
    const tr = cella.closest('tr')!;
    expect(tr.getAttribute('tabindex')).toBeNull();

    await userEvent.click(cella);
    expect(aperta).not.toHaveBeenCalled();
  });

  /**
   * Il permesso vero sta sull'API: qui si presidia che chi non può correggere
   * non veda nemmeno l'invito, invece di scoprirlo dopo il clic.
   */
  it('senza permesso di correzione la riga manuale resta ferma', async () => {
    const aperta = await montaTabella([riga()], false);

    expect(screen.queryByLabelText(/Apri il corrispettivo manuale/)).toBeNull();

    await userEvent.click(screen.getByText('2', { selector: 'td' }));
    expect(aperta).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ Il troncamento a 25 righe è una scelta di VISUALIZZAZIONE su schermo
   * compatto. In un registro fiscale il rischio è che diventi un troncamento
   * dei dati: questo test inchioda il confine — su schermo normale non si
   * tronca niente, e le righe consegnate restano tutte a schermo.
   */
  it("su schermo non compatto l'elenco non si tronca mai", async () => {
    const molte = Array.from({ length: 60 }, (_, i) => ({
      ...riga(),
      rowId: `r-${i}`,
      orderNumber: String(i + 1),
    }));
    await montaTabella(molte);

    // Nessun invito ad aprire il resto: non c'è un resto.
    expect(screen.queryByText(/Mostra le altre/)).toBeNull();
    // E le righe disegnate sono tutte quelle ricevute.
    expect(document.querySelectorAll('.corrispettivi-table__row').length).toBe(60);
  });

  /**
   * ⚠️ La riga ha DUE vesti — le colonne (desktop) e la cella card (mobile) —
   * e mostrano gli stessi valori. Senza `aria-hidden` sulla card, un lettore
   * di schermo annuncerebbe ogni riga due volte: il difetto è invisibile a
   * chi guarda, e nessun test di layout lo trova.
   */
  it('la veste a card non viene annunciata: i dati sono le colonne', async () => {
    await montaTabella([riga()]);

    const card = document.querySelector('.corrispettivi-table__card');
    expect(card).not.toBeNull();
    expect(card!.getAttribute('aria-hidden')).toBe('true');

    // La cella vera NON è aria-hidden: è lei a portare il dato.
    const cella = screen.getByText('2', { selector: 'td' });
    expect(cella.getAttribute('aria-hidden')).toBeNull();
  });
});

/**
 * ⛔ **L'ordinamento manuale esiste solo con «Raggruppa: Nessuno»** (`10` §20,
 * deciso il 20/08/2026).
 *
 * Il raggruppamento per giorno è già una forma di ordinamento strutturato:
 * sovrapporgliene un altro romperebbe subtotali e piedi di giornata. Qui si
 * presidia il confine, che a occhio non si vede — un'intestazione che smette di
 * essere premibile è una differenza di un pixel.
 */
describe('ordinamento del Registro', () => {
  it('con «Raggruppa: Nessuno» le intestazioni si premono', async () => {
    const chiavi = vi.fn();
    await render(CorrispettiviOrdersTableComponent, {
      inputs: { rows: [riga()], raggruppaPerGiorno: false },
      on: { sortChange: chiavi },
    });

    await userEvent.click(screen.getByRole('button', { name: /Data/ }));

    expect(chiavi).toHaveBeenCalledWith([{ columnId: 'occurredAt', direction: 'asc' }]);
  });

  it('⛔ con «Raggruppa: Giorno» nessuna intestazione è un pulsante', async () => {
    await render(CorrispettiviOrdersTableComponent, {
      inputs: { rows: [riga()], raggruppaPerGiorno: true },
    });

    expect(screen.queryByRole('button', { name: /Data/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Totale/ })).toBeNull();
  });

  it('⭐ il ciclo è quello comune: seconda pressione, verso opposto', async () => {
    const chiavi = vi.fn();
    await render(CorrispettiviOrdersTableComponent, {
      inputs: {
        rows: [riga()],
        raggruppaPerGiorno: false,
        sort: [{ columnId: 'total', direction: 'asc' as const }],
      },
      on: { sortChange: chiavi },
    });

    await userEvent.click(screen.getByRole('button', { name: /Totale/ }));

    expect(chiavi).toHaveBeenCalledWith([{ columnId: 'total', direction: 'desc' }]);
  });
});
