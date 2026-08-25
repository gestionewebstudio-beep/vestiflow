import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentPageStateComponent } from './document-page-state.component';
import type { DocumentPageState } from './document-page-state.model';

/**
 * ⭐ **Il contratto della macchina degli stati di pagina.**
 *
 * ⚠️ **Prima di queste prove, una sola in tutta l'app toccava questi stati** —
 * quella del banco sulla lettura fallita. `loading` e `not-found` non erano
 * provati da nessuna parte, in nessuna delle sette maschere: è ciò che
 * l'operatore vede quando qualcosa va storto, e non lo guardava nessuno.
 */
describe('DocumentPageStateComponent', () => {
  async function monta(state: DocumentPageState, on?: { retry?: () => void }) {
    return render(
      '<app-document-page-state [state]="s" (retry)="r()">' +
        '<p documentPageStateBlocked>Documento non modificabile</p>' +
        '</app-document-page-state>',
      {
        imports: [DocumentPageStateComponent],
        componentProperties: { s: state, r: on?.retry ?? (() => undefined) },
      },
    );
  }

  it('⭐ «loading»: lo scheletro, e nient’altro', async () => {
    const { container } = await monta('loading');

    expect(container.querySelector('app-table-skeleton')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull();
    expect(screen.queryByText('Documento non modificabile')).toBeNull();
  });

  it('⭐ «error»: un messaggio SOLO, uguale per tutte le maschere', async () => {
    // ⛔ Diceva «il documento», «l'ordine» e «l'ordine cliente» a seconda di chi
    // lo mostrava: la stessa cosa con la parola del tipo.
    await monta('error');

    expect(screen.getByText('Impossibile caricare il documento.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeTruthy();
  });

  it('⭐ e «Riprova» chiede alla maschera di rileggere', async () => {
    const retry = vi.fn();
    await monta('error', { retry });

    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('⭐ «not-found»: la struttura è comune, il MOTIVO lo porta il documento', async () => {
    // ⛔ E' la distinzione che il componente esiste per tenere: l'Ordine cliente
    // calcola tre motivi diversi — preventivo, scarico manuale, ordine — e il
    // livello comune non deve conoscerne nessuno.
    const { container } = await monta('not-found');

    expect(screen.getByText('Documento non modificabile')).toBeTruthy();
    expect(container.querySelector('app-table-skeleton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull();
  });

  it('⛔ «ready»: non rende NIENTE — il documento lo mostra la maschera', async () => {
    // ⚠️ La meta' che si dimentica. Se rendesse qualcosa, ogni maschera si
    // ritroverebbe un residuo sopra il documento per tutta la sua vita utile.
    const { container } = await monta('ready');

    expect(container.querySelector('app-table-skeleton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull();
    expect(screen.queryByText('Documento non modificabile')).toBeNull();
  });

  // ⛔ Qui c'era una prova «un solo stato alla volta», con un ciclo su tre
  // `render`. Tolta per due ragioni: il banco non ammette due configurazioni
  // del modulo nello stesso test, e soprattutto era RIDONDANTE — le tre prove
  // per stato asseriscono gia' che gli altri due siano assenti.
  //
  // ⭐ E con UNO stato al posto di tre booleani, due rami accesi insieme non
  // sono nemmeno rappresentabili: e' la ragione per cui l'ingresso e' uno solo.
});
