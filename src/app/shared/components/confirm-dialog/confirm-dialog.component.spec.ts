import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogComponent } from './confirm-dialog.component';

/**
 * ⚠️ jsdom non implementa `<dialog>`: senza questa protesi `showModal()` non
 * esiste e il componente esplode. E' un limite del banco di prova, non del
 * componente — che usa il dialogo NATIVO apposta, per avere trappola del fuoco,
 * Esc e sfondo inerte senza scriverli a mano.
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
 * ⭐ **La terza azione** — aggiunta il 24/08/2026.
 *
 * Il dialogo «modifiche non salvate» ha tre risposte vere: torno indietro,
 * esco perdendo, salvo ed esco. Con due sole azioni quattro maschere
 * dovevano tenersi un guscio scritto a mano — e con esso un modale che NON e'
 * un `<dialog>` nativo: niente trappola del fuoco, niente Esc, niente sfondo
 * inerte, contro una regola di progetto esplicita.
 *
 * ⚠️ Una sola azione mancante teneva in piedi **undici copie**.
 */
describe('ConfirmDialogComponent — la terza azione', () => {
  it('⛔ senza etichetta i pulsanti restano DUE', async () => {
    await render(ConfirmDialogComponent, {
      inputs: { open: true, title: 'Titolo', message: 'Messaggio' },
    });

    expect(screen.queryAllByRole('button')).toHaveLength(2);
  });

  it('⭐ con l’etichetta ne compare una terza, in mezzo', async () => {
    await render(ConfirmDialogComponent, {
      inputs: {
        open: true,
        title: 'Modifiche non salvate',
        message: 'Uscendo andranno perse.',
        cancelLabel: 'Annulla',
        extraLabel: 'Esci senza salvare',
        confirmLabel: 'Salva e chiudi',
      },
    });

    // L'ordine conta: fra «torno indietro» e «vado avanti come dico io» sta la
    // via di mezzo. Invertirli metterebbe l'uscita distruttiva accanto al
    // pollice che cerca la conferma.
    expect(screen.queryAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'Annulla',
      'Esci senza salvare',
      'Salva e chiudi',
    ]);
  });

  it('⭐ premendola emette «extra» e chiude, senza confermare', async () => {
    const extra = vi.fn();
    const confirmed = vi.fn();
    const dismissed = vi.fn();
    const view = await render(ConfirmDialogComponent, {
      inputs: { open: true, title: 'T', message: 'M', extraLabel: 'Esci senza salvare' },
      on: { extra, confirmed, dismissed },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Esci senza salvare' }));
    view.fixture.detectChanges();

    // ⛔ Le tre uscite restano distinte: chi ascolta `confirmed` non deve
    //    ricevere anche la via di mezzo, o «Salva e chiudi» scatterebbe su
    //    «Esci senza salvare» — cioe' salverebbe chi voleva buttare via.
    expect(extra).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();
    expect(dismissed).not.toHaveBeenCalled();
  });
});
