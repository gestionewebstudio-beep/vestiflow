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
 * ⛔ **Qui l'esempio era il dialogo «modifiche non salvate»**, e diceva che ha
 * «tre risposte vere: torno indietro, esco perdendo, salvo ed esco». Il
 * proprietario ha deciso il contrario il 24/08/2026: quel dialogo ne ha DUE —
 * Annulla · Esci senza salvare — e il salvataggio resta il pulsante Salva.
 *
 * ⚠️ Lasciarlo com'era non sarebbe stato un dettaglio: la spec di un componente
 * condiviso e' dove si impara a usarlo, e questa insegnava a rimettere il
 * pulsante che e' stato tolto da tredici maschere. `check-exit-dialog.mjs` lo
 * fermerebbe, ma dopo — e con l'aria di un capriccio del controllo.
 *
 * ⭐ **L'esempio ora e' un caso a tre esiti VERI**: «Ordine non evaso del
 * tutto» dell'Ordine cliente, dove i tre pulsanti chiamano tre gestori
 * distinti — `dismissPartialOrdersDialog`, `declinePartialOrdersDialog`,
 * `confirmPartialOrdersDialog`. Due salvano, uno no.
 *
 * ⛔ **Il criterio e' il GESTORE, non il numero di pulsanti.** Il difetto gia'
 * misurato su «Dati incompleti» era due bottoni sullo STESSO gestore: non tre
 * esiti, ma due esiti e un pulsante di troppo.
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
        title: 'Ordine non evaso del tutto',
        message: 'Non sono stati evasi tutti i prodotti previsti. Forzare lo stato a Concluso?',
        cancelLabel: 'Annulla',
        extraLabel: 'Lascia parzialmente concluso',
        confirmLabel: 'Forza a Concluso',
      },
    });

    // L'ordine conta: fra «torno indietro» e «vado avanti come dico io» sta la
    // via di mezzo. Invertirli metterebbe l'uscita distruttiva accanto al
    // pollice che cerca la conferma.
    expect(screen.queryAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'Annulla',
      'Lascia parzialmente concluso',
      'Forza a Concluso',
    ]);
  });

  it('⭐ premendola emette «extra» e chiude, senza confermare', async () => {
    const extra = vi.fn();
    const confirmed = vi.fn();
    const dismissed = vi.fn();
    const view = await render(ConfirmDialogComponent, {
      inputs: { open: true, title: 'T', message: 'M', extraLabel: 'Lascia parzialmente concluso' },
      on: { extra, confirmed, dismissed },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Lascia parzialmente concluso' }));
    view.fixture.detectChanges();

    // ⛔ Le tre uscite restano distinte: chi ascolta `confirmed` non deve
    //    ricevere anche la via di mezzo, o «Forza a Concluso» scatterebbe su
    //    «Lascia parzialmente concluso» — cioe' concluderebbe chi non voleva.
    expect(extra).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();
    expect(dismissed).not.toHaveBeenCalled();
  });
});
