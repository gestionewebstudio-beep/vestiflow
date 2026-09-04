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
 * ⛔ **L’esempio che stava qui non esiste più — 29/08/2026.** Era «Ordine non
 * evaso del tutto» dell’Ordine cliente, coi tre gestori del workflow di
 * evasione parziale. Quel workflow è **abolito** (`18` §2.3): il documento
 * conclusivo conclude l’ordine da sé, non c’è più un «lascialo
 * parzialmente concluso» da offrire, e il dialogo è sceso a due esiti.
 *
 * ⭐ **Oggi `extraLabel` non ha nessun consumer, e RESTA — deciso il
 * 29/08/2026.** È una primitiva generica del componente condiviso: non si
 * rimuove solo perché nessuno la usa in questo momento.
 *
 * ⛔ Le condizioni perché possa restare inattiva, e questo test le tiene
 * ferme: non espone il workflow parziale nella UI, non viene chiamata dal
 * workflow manuale, non produce effetti, non introduce stati o percorsi
 * alternativi. È la ragione per cui l’esempio qui sopra è stato reso
 * NEUTRO invece che aggiornato con un altro caso reale.
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
        // Etichette neutre: il contratto provato è la POSIZIONE dei tre
        // pulsanti, non un caso d’uso particolare — e quello che stava qui
        // non esiste più (vedi l’intestazione).
        title: 'Titolo',
        message: 'Messaggio',
        cancelLabel: 'Annulla',
        extraLabel: 'Via di mezzo',
        confirmLabel: 'Conferma',
      },
    });

    // L'ordine conta: fra «torno indietro» e «vado avanti come dico io» sta la
    // via di mezzo. Invertirli metterebbe l'uscita distruttiva accanto al
    // pollice che cerca la conferma.
    expect(screen.queryAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'Annulla',
      'Via di mezzo',
      'Conferma',
    ]);
  });

  it('⭐ premendola emette «extra» e chiude, senza confermare', async () => {
    const extra = vi.fn();
    const confirmed = vi.fn();
    const dismissed = vi.fn();
    const view = await render(ConfirmDialogComponent, {
      inputs: { open: true, title: 'T', message: 'M', extraLabel: 'Via di mezzo' },
      on: { extra, confirmed, dismissed },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Via di mezzo' }));
    view.fixture.detectChanges();

    // ⛔ Le tre uscite restano distinte: chi ascolta `confirmed` non deve
    //    ricevere anche la via di mezzo, o la conferma scatterebbe su chi ha
    //    scelto l'alternativa — cioe' farebbe la cosa che non voleva.
    expect(extra).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();
    expect(dismissed).not.toHaveBeenCalled();
  });
});
