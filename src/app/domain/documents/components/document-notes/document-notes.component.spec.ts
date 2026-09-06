import { FormControl, FormGroup } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DocumentNotesComponent } from './document-notes.component';

/**
 * ⭐ **Il contratto dell'area note.**
 *
 * Le cinque maschere che avevano questi due campi li chiamavano in cinque modi
 * diversi. Queste prove inchiodano le due etichette e — soprattutto — la
 * distinzione che una sola delle cinque diceva: quale delle due esce in stampa.
 */
describe('DocumentNotesComponent', () => {
  function gruppo(valori?: { notes?: string; internalComment?: string }) {
    return new FormGroup({
      notes: new FormControl(valori?.notes ?? '', { nonNullable: true }),
      internalComment: new FormControl(valori?.internalComment ?? '', { nonNullable: true }),
    });
  }

  async function monta(opzioni?: { readonly group?: FormGroup; readonly readOnly?: boolean }) {
    const group = opzioni?.group ?? gruppo();
    const view = await render(DocumentNotesComponent, {
      inputs: {
        group,
        notesId: 'prova-notes',
        internalId: 'prova-internal',
        readOnly: opzioni?.readOnly ?? false,
      },
    });
    return { ...view, group };
  }

  it('⭐ le due etichette sono queste, e non cambiano da una maschera all’altra', async () => {
    await monta();

    expect(screen.getByLabelText('Note documento')).toBeTruthy();
    expect(screen.getByLabelText('Commento interno')).toBeTruthy();
  });

  it('⭐ e ognuna dice se esce in stampa: e’ l’unica differenza che conta', async () => {
    // ⚠️ Una sola delle cinque maschere lo diceva — «Note (visibili in stampa)»
    // — e quella distinzione vale per tutte. Senza, i due campi sembrano due
    // caselle di testo uguali e la scelta fra loro e' a occhio.
    await monta();

    expect(screen.getByLabelText<HTMLTextAreaElement>('Note documento').placeholder).toBe(
      'Visibili in stampa',
    );
    expect(screen.getByLabelText<HTMLTextAreaElement>('Commento interno').placeholder).toBe(
      'Nota interna, mai in stampa',
    );
  });

  it('scrive sui controlli del gruppo che riceve', async () => {
    const group = gruppo();
    await monta({ group });

    await userEvent.type(screen.getByLabelText('Commento interno'), 'da richiamare');

    expect(group.controls.internalComment.value).toBe('da richiamare');
  });

  it('mostra i valori già presenti sul documento', async () => {
    await monta({
      group: gruppo({ notes: 'Consegna al piano', internalComment: 'Cliente lento' }),
    });

    expect(screen.getByLabelText<HTMLTextAreaElement>('Note documento').value).toBe(
      'Consegna al piano',
    );
    expect(screen.getByLabelText<HTMLTextAreaElement>('Commento interno').value).toBe(
      'Cliente lento',
    );
  });

  it('⛔ in sola lettura non si scrive', async () => {
    const group = gruppo({ notes: 'Fermo' });
    await monta({ group, readOnly: true });

    await userEvent.type(screen.getByLabelText('Note documento'), 'aggiunta');

    expect(group.controls.notes.value).toBe('Fermo');
  });

  it('⭐ ospita quello che il documento ci aggiunge, senza sapere che cosa sia', async () => {
    // L'Arrivo merce ci mette due spunte — «aggiorna il costo in anagrafica»,
    // «aggiorna i prezzi» — che sono dominio suo. Se per ospitarle servisse un
    // `[showSpunte]`, il contratto sarebbe sbagliato.
    const group = gruppo();
    await render(
      '<app-document-notes [group]="g" notesId="n" internalId="i">' +
        '<label>Aggiorna il costo in anagrafica</label>' +
        '</app-document-notes>',
      { imports: [DocumentNotesComponent], componentProperties: { g: group } },
    );

    expect(screen.getByText('Aggiorna il costo in anagrafica')).toBeTruthy();
  });
});
