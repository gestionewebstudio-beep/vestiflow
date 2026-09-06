import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ViewportService } from '@core/services/viewport.service';

import { DocumentActionsComponent } from './document-actions.component';

/**
 * ⭐ **Il contratto della barra azioni.**
 *
 * La grammatica non e' stata inventata: misurata su tutte e sette le maschere
 * documentali prima dell'estrazione, l'ordine era gia' identico in tutte
 * (`docs/…TESTATE…` §34.6). Queste prove la INCHIODANO, cosi' che la prossima
 * maschera montata non possa reintrodurre una variante.
 */
describe('DocumentActionsComponent', () => {
  /**
   * ⚠️ `ViewportService` va sostituito: in jsdom non c'e' `matchMedia` e il
   * foglio globale non e' caricato, quindi il servizio vero risponde sempre
   * «non compatta» — e la veste compatta non sarebbe provabile affatto.
   */
  async function monta(opzioni?: {
    readonly compatta?: boolean;
    readonly inputs?: Record<string, unknown>;
    readonly on?: Record<string, unknown>;
  }) {
    return render(DocumentActionsComponent, {
      inputs: opzioni?.inputs ?? {},
      on: opzioni?.on ?? {},
      providers: [
        { provide: ViewportService, useValue: { compact: signal(opzioni?.compatta ?? false) } },
      ],
    });
  }

  it('⭐ l’ordine e’ Chiudi poi Salva, e non si riordina', async () => {
    await monta();

    expect(screen.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'Chiudi',
      'Salva documento',
    ]);
  });

  it('⭐ le azioni specifiche stanno FRA Chiudi e Salva', async () => {
    // E' dove la misura le ha trovate in tutte le maschere che ne hanno:
    // Arrivo merce («Stampa etichette»), Ordine cliente (i due menu).
    await render(
      '<app-document-actions>' +
        '<button documentActionsExtra type="button">Stampa etichette</button>' +
        '</app-document-actions>',
      {
        imports: [DocumentActionsComponent],
        providers: [{ provide: ViewportService, useValue: { compact: signal(false) } }],
      },
    );

    expect(screen.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'Chiudi',
      'Stampa etichette',
      'Salva documento',
    ]);
  });

  it('Chiudi chiede l’uscita: che cosa comporti lo decide il documento', async () => {
    const closeRequested = vi.fn();
    await monta({ on: { closeRequested } });

    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));

    expect(closeRequested).toHaveBeenCalledTimes(1);
  });

  // ── Le due modalita' del pulsante Salva ───────────────────────────────────
  //
  // ⚠️ Non e' una policy di dominio, e' che PULSANTE rendere: cinque maschere
  // salvano con `<form (ngSubmit)>` e un `type="submit"` — scelta deliberata,
  // documentata in `no-implicit-submit.directive` — e tre con un gestore di
  // clic. Renderne sempre uno solo romperebbe le altre.

  it('⭐ modalita’ submit (predefinita): il pulsante e’ un submit e NON emette', async () => {
    const saveRequested = vi.fn();
    await monta({ on: { saveRequested } });

    const salva = screen.getByRole('button', { name: 'Salva documento' });
    expect(salva.getAttribute('type')).toBe('submit');

    await userEvent.click(salva);
    // Il salvataggio passa da `ngSubmit` del modulo che ospita la barra:
    // emettere anche qui lo farebbe partire DUE volte.
    expect(saveRequested).not.toHaveBeenCalled();
  });

  it('⭐ modalita’ button: il pulsante emette, e non invia niente', async () => {
    const saveRequested = vi.fn();
    await monta({ inputs: { saveType: 'button' }, on: { saveRequested } });

    const salva = screen.getByRole('button', { name: 'Salva documento' });
    expect(salva.getAttribute('type')).toBe('button');

    await userEvent.click(salva);
    expect(saveRequested).toHaveBeenCalledTimes(1);
  });

  it('l’etichetta del salvataggio e’ configurabile: al banco l’operazione ha un nome suo', async () => {
    await monta({ inputs: { saveLabel: 'Concludi vendita' } });

    expect(screen.getByRole('button', { name: 'Concludi vendita' })).toBeTruthy();
  });

  // ── Ctrl/Cmd + S, ovunque ─────────────────────────────────────────────────

  it('⭐ Ctrl+S preme il pulsante Salva', async () => {
    const saveRequested = vi.fn();
    await monta({ inputs: { saveType: 'button' }, on: { saveRequested } });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));

    expect(saveRequested).toHaveBeenCalledTimes(1);
  });

  it('⭐ e Cmd+S fa lo stesso: la scorciatoia vale su Mac', async () => {
    const saveRequested = vi.fn();
    await monta({ inputs: { saveType: 'button' }, on: { saveRequested } });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', metaKey: true }));

    expect(saveRequested).toHaveBeenCalledTimes(1);
  });

  it('⛔ ma non salva mentre il salvataggio e’ in corso', async () => {
    // ⚠️ Non serve un secondo controllo: il pulsante e' disabilitato, e un
    // pulsante disabilitato non risponde al clic. La scorciatoia «preme il
    // pulsante», quindi eredita la condizione invece di ricopiarla.
    const saveRequested = vi.fn();
    await monta({ inputs: { saveType: 'button', saving: true }, on: { saveRequested } });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));

    expect(saveRequested).not.toHaveBeenCalled();
  });

  it('⛔ né in sola lettura', async () => {
    const saveRequested = vi.fn();
    await monta({ inputs: { saveType: 'button', readOnly: true }, on: { saveRequested } });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));

    expect(saveRequested).not.toHaveBeenCalled();
  });

  it('⭐ Ctrl+S toglie prima il fuoco al campo attivo', async () => {
    // ⚠️ **E' la meta' che conta, e non e' cosmetica.** La cella a
    // ricerca-e-selezione delle righe conferma quello che si e' digitato
    // proprio sul blur — «Uscire dal campo conferma quello che si e' digitato,
    // come il Tab». Senza questo, Ctrl+S battuto mentre si scrive in quella
    // cella salverebbe il valore PRECEDENTE, e in silenzio.
    //
    // ⭐ Non e' un comportamento nuovo: e' quello che il CLIC gia' fa, perche'
    // premere un pulsante toglie il fuoco al campo che lo aveva. La scorciatoia
    // si limita a non essere diversa dal clic.
    const saveRequested = vi.fn();
    await monta({ inputs: { saveType: 'button' }, on: { saveRequested } });

    const campo = document.createElement('input');
    document.body.appendChild(campo);
    campo.focus();
    expect(document.activeElement).toBe(campo);

    // ⛔ Qui si asseriva `activeElement` diverso dal campo, e la prova passava
    // ANCHE togliendo il blur dal componente: nel banco di prova il clic sul
    // pulsante sposta gia' il fuoco da solo, quindi l'asserzione era vera per
    // un'altra ragione. Si misura la CHIAMATA, che e' la cosa che si vuole.
    const blur = vi.spyOn(campo, 'blur');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));

    expect(blur).toHaveBeenCalledTimes(1);
    expect(saveRequested).toHaveBeenCalledTimes(1);

    blur.mockRestore();
    campo.remove();
  });

  it('la S da sola non fa niente: si digita nei campi', async () => {
    const saveRequested = vi.fn();
    await monta({ inputs: { saveType: 'button' }, on: { saveRequested } });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));

    expect(saveRequested).not.toHaveBeenCalled();
  });

  // ── Sola lettura ──────────────────────────────────────────────────────────

  it('⭐ in sola lettura la barra RESTA, e Chiudi funziona', async () => {
    // ⛔ Prima la copia mobile spariva del tutto (`@if (!formReadOnly())`)
    // mentre quella di scrivania restava col Salva spento: due comportamenti
    // per lo stesso stato, e sul telefono spariva anche l'uscita.
    const closeRequested = vi.fn();
    await monta({ inputs: { readOnly: true }, on: { closeRequested } });

    expect(screen.getByRole('button', { name: 'Salva documento' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(closeRequested).toHaveBeenCalledTimes(1);
  });

  it('durante il salvataggio si spengono ENTRAMBI', async () => {
    // Stessa azione, stessa condizione, nelle due vesti: uscire mentre la
    // richiesta e' in volo lascerebbe il documento a meta'.
    await monta({ inputs: { saving: true } });

    expect(screen.getByRole('button', { name: 'Chiudi' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Salva documento/ })).toBeDisabled();
  });

  // ── Le due vesti ──────────────────────────────────────────────────────────

  // ⚠️ DUE prove, non una con due `render`: il banco di prova non ammette una
  // seconda configurazione del modulo nello stesso test («Cannot configure the
  // test module when the test module has already been instantiated»).
  //
  // `regole-stile-ui` §5: ghost sulla barra di scrivania, secondary nella
  // coppia in fondo al documento. Cambia l'aspetto, non il significato.
  it('⭐ veste di scrivania: Chiudi e’ ghost', async () => {
    const { container } = await monta({ compatta: false });

    expect(container.querySelector('.app-button--ghost')?.textContent?.trim()).toBe('Chiudi');
  });

  it('⭐ veste compatta: lo stesso Chiudi diventa secondary', async () => {
    const { container } = await monta({ compatta: true });

    expect(container.querySelector('.app-button--secondary')?.textContent?.trim()).toBe('Chiudi');
  });

  it('⛔ e la barra non esiste due volte: e’ un solo elemento', async () => {
    // ⚠️ E' il difetto che l'estrazione toglie: sette maschere la dichiaravano
    // DUE volte, e nel Trasferimento la copia mobile aveva un `@if` con rami
    // identici perche' la differenza si era persa in una copia sola.
    // ⚠️ Non si conta `app-document-actions` nel container: il banco di prova
    // monta il componente come radice, quindi l'host non ci finisce dentro. Si
    // conta cio' che l'operatore VEDE — un solo Chiudi, un solo Salva.
    await monta({ compatta: true });

    expect(screen.getAllByRole('button', { name: 'Chiudi' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Salva documento' })).toHaveLength(1);
  });
});
