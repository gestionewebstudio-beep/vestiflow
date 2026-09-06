import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DeleteConfirmComponent } from './delete-confirm.component';

/**
 * ⚠️ jsdom non implementa `<dialog>`: senza questa protesi `showModal()` non
 * esiste. È un limite del banco di prova, non del componente — che usa il
 * dialogo NATIVO apposta, per avere trappola del fuoco ed Esc senza scriverli.
 */
beforeAll(() => {
  const proto = globalThis.HTMLDialogElement?.prototype;
  if (proto && !proto.showModal) {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    proto.close = function close(this: HTMLDialogElement) {
      this.open = false;
    };
  }
});

/**
 * ⭐ **Questi test presidiano una SEQUENZA, non un dialogo.**
 *
 * Il valore del componente sta nell'ordine dei due passaggi e nel fatto che il
 * primo non elimini: sono le due cose che, scritte a mano in ogni schermata,
 * possono divergere senza che nessuno se ne accorga.
 */
describe('eliminazione a due conferme', () => {
  /*
    ⚠️ **Un `<dialog>` chiuso RESTA nel DOM**, ed è la ragione per cui questi
    test guardano la proprietà `open` e non la sparizione del testo. Cercare
    `queryByText` qui darebbe sempre «presente», e i test passerebbero o
    fallirebbero per il motivo sbagliato.
  */
  const aperti = () => [...document.querySelectorAll('dialog')].filter((d) => d.open).length;

  const monta = async () => {
    const eliminato = vi.fn();
    const annullato = vi.fn();
    await render(DeleteConfirmComponent, {
      inputs: {
        open: true,
        title: 'Elimina arrivo merce',
        consequence: 'Le giacenze caricate verranno ripristinate.',
      },
      on: { confirmed: eliminato, dismissed: annullato },
    });
    return { eliminato, annullato };
  };

  it('il primo passaggio dice cosa succede, e NON elimina', async () => {
    const { eliminato } = await monta();

    expect(screen.getByText('Elimina arrivo merce')).toBeTruthy();
    expect(screen.getByText('Le giacenze caricate verranno ripristinate.')).toBeTruthy();

    /*
      ⛔ **Il pulsante dice «Continua», non «Elimina».** Al primo passaggio non
      si elimina ancora niente: un pulsante che promettesse l'eliminazione
      renderebbe il secondo passaggio una sorpresa invece che una conferma.
    */
    await userEvent.click(screen.getByRole('button', { name: 'Continua' }));
    expect(eliminato).not.toHaveBeenCalled();
  });

  it('solo il secondo passaggio elimina', async () => {
    const { eliminato } = await monta();

    await userEvent.click(screen.getByRole('button', { name: 'Continua' }));
    expect(screen.getByText("Confermi l'eliminazione?")).toBeTruthy();
    expect(screen.getByText("L'operazione non è reversibile.")).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Elimina definitivamente' }));
    expect(eliminato).toHaveBeenCalledTimes(1);
  });

  it('annullare al PRIMO passaggio non elimina e chiude tutto', async () => {
    const { eliminato, annullato } = await monta();

    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    expect(eliminato).not.toHaveBeenCalled();
    expect(annullato).toHaveBeenCalledTimes(1);
    expect(aperti()).toBe(0);
  });

  /**
   * ⛔ **Il caso che una sequenza scritta a mano sbaglia più facilmente**:
   * annullare al secondo passaggio deve FINIRE, non tornare al primo.
   */
  it('annullare al SECONDO passaggio non riapre il primo', async () => {
    const { eliminato, annullato } = await monta();

    await userEvent.click(screen.getByRole('button', { name: 'Continua' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    expect(eliminato).not.toHaveBeenCalled();
    expect(annullato).toHaveBeenCalledTimes(1);
    expect(aperti()).toBe(0);
  });

  /**
   * ⚠️ **I due dialoghi non si sovrappongono.** `open` resta vero per tutta la
   * sequenza — è il segnale «eliminazione in corso», non «primo dialogo
   * visibile» — quindi senza l'esclusione si vedrebbero insieme.
   */
  it('i due passaggi non sono mai visibili insieme', async () => {
    await monta();

    expect(aperti()).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: 'Continua' }));

    expect(aperti()).toBe(1);
  });

  it('senza conseguenza dichiarata dice comunque qualcosa di vero', async () => {
    await render(DeleteConfirmComponent, {
      inputs: { open: true, title: 'Elimina codice IVA' },
    });

    expect(screen.getByText('Non sarà più recuperabile.')).toBeTruthy();
  });
});
