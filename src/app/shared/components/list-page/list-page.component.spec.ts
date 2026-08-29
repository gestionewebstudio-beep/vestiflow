import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ViewportService } from '@core/services/viewport.service';

import { ListPageComponent } from './list-page.component';

/**
 * ⭐ **La macchina degli stati è dello SHELL, non del consumer.**
 *
 * È il guadagno principale del telaio: quei quattro rami erano scritti undici
 * volte, identici. Se si rompono qui, si rompono ovunque — quindi sono la parte
 * che queste prove presidiano per prima.
 */

/** Un consumer finto che riempie tutti gli slot, per verificare la proiezione. */
@Component({
  imports: [ListPageComponent],
  template: `
    <app-list-page
      pageTitle="Fornitori"

      [loading]="loading"
      [error]="error"
      [isEmpty]="isEmpty"
      [skeletonColumns]="5"
      [emptyTitle]="emptyTitle"
      (retry)="onRetry()"
    >
      <button pageActions type="button">Nuovo fornitore</button>
      <div filters>un filtro</div>
      <div warnings>un avviso</div>
      <table data>
        <tbody>
          <tr>
            <td>una riga</td>
          </tr>
        </tbody>
      </table>
      <div empty>vuoto su misura</div>
      <div summary>1–4 di 4</div>
      <div listActions>azioni di elenco</div>
    </app-list-page>
  `,
})
class ConsumerFintoComponent {
  loading = false;
  error: string | null = null;
  isEmpty = false;
  emptyTitle: string | undefined = undefined;
  readonly onRetry = vi.fn();
}

function monta(stato: Partial<ConsumerFintoComponent> = {}) {
  return render(ConsumerFintoComponent, { componentProperties: stato });
}

describe('ListPageComponent — la macchina degli stati', () => {
  it('⭐ caricando mostra lo scheletro, e NON i dati', async () => {
    await monta({ loading: true });

    expect(document.querySelector('app-table-skeleton')).not.toBeNull();
    expect(screen.queryByText('una riga')).toBeNull();
  });

  it('⭐ in errore mostra il messaggio, e NON i dati', async () => {
    await monta({ error: 'Connessione assente' });

    expect(screen.getByText('Connessione assente')).toBeVisible();
    expect(screen.queryByText('una riga')).toBeNull();
  });

  it('⭐ l’errore batte il vuoto: un elenco che non ha caricato non è vuoto', async () => {
    // ⚠️ È l'ordine dei rami, e conta: dire «nessun risultato» quando la
    //    richiesta è fallita manda l'operatore a cercare un filtro sbagliato.
    await monta({ error: 'Connessione assente', isEmpty: true });

    expect(screen.getByText('Connessione assente')).toBeVisible();
    expect(screen.queryByText('vuoto su misura')).toBeNull();
  });

  it('⭐ e il caricamento batte l’errore precedente', async () => {
    await monta({ loading: true, error: 'Connessione assente' });

    expect(document.querySelector('app-table-skeleton')).not.toBeNull();
    expect(screen.queryByText('Connessione assente')).toBeNull();
  });

  it('✅ a regime mostra i dati', async () => {
    await monta();

    expect(screen.getByText('una riga')).toBeVisible();
    expect(document.querySelector('app-table-skeleton')).toBeNull();
  });

  it('✅ «Riprova» chiede al consumer di ricaricare', async () => {
    const { fixture } = await monta({ error: 'Connessione assente' });

    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }));

    expect(fixture.componentInstance.onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('ListPageComponent — lo stato vuoto ha due forme', () => {
  it('⭐ senza `emptyTitle` usa quello proiettato dal consumer', async () => {
    await monta({ isEmpty: true });

    expect(screen.getByText('vuoto su misura')).toBeVisible();
    expect(document.querySelector('app-empty-state')).toBeNull();
  });

  it('⭐ con `emptyTitle` usa quello standard, e non entrambi', async () => {
    await monta({ isEmpty: true, emptyTitle: 'Nessun fornitore' });

    expect(screen.getByText('Nessun fornitore')).toBeVisible();
    expect(screen.queryByText('vuoto su misura')).toBeNull();
  });
});

describe('ListPageComponent — le zone', () => {
  // ⚠️ **Un montaggio per prova.** `TestBed` non si riconfigura dentro un solo
  //    `it`: un ciclo che monta quattro volte fallisce, e non per il motivo che
  //    la prova vuole misurare.
  it.each([
    ['caricando', { loading: true }],
    ['in errore', { error: 'Connessione assente' }],
    ['vuoto', { isEmpty: true }],
    ['a regime', {}],
  ])('⭐ %s: testata, strumenti, avvisi, totali e funzioni restano', async (_nome, stato) => {
    // ⚠️ Non stanno dentro i rami: la testata deve restare mentre l'elenco
    //    carica, o la pagina «sparisce» a ogni ricarica.
    await monta(stato);

    expect(screen.getByRole('heading', { name: 'Fornitori' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nuovo fornitore' })).toBeVisible();
    expect(screen.getByText('un filtro')).toBeVisible();
    expect(screen.getByText('un avviso')).toBeVisible();
    expect(screen.getByText('1–4 di 4')).toBeVisible();
    expect(screen.getByText('azioni di elenco')).toBeVisible();
  });

  it('⛔ nessun sottotitolo: il telaio non ne rende, e nessuno può passarlo', async () => {
    // Decisione del proprietario del 29/08/2026: «non servono, recuperiamo
    // spazio». Un input rimosso è più forte di una convenzione.
    await render(ListPageComponent, {
      inputs: { pageTitle: 'Clienti', loading: false, skeletonColumns: 4 },
    });

    expect(screen.getByRole('heading', { name: 'Clienti' })).toBeVisible();
    expect(document.querySelector('.list-page__subtitle')).toBeNull();
  });
});

/**
 * ⭐ **Il pannello filtri compatto, e la casella degli overlay.**
 *
 * ⛔ Il telaio non ha una casella senza nome: il contenuto proiettato che non
 * trova uno slot Angular lo **elimina dal DOM**, senza errori e senza test
 * rossi. Misurato il 29/08/2026 — due pannelli persi in silenzio. Queste prove
 * inchiodano le caselle che li hanno rimessi al loro posto.
 */
@Component({
  imports: [ListPageComponent],
  template: `
    <app-list-page
      pageTitle="Ordini fornitore"
      [loading]="false"
      [skeletonColumns]="5"
      [activeFilterCount]="attivi"
      (filtersCleared)="onAzzera()"
    >
      <div period>periodo in barra</div>
      <div filters>un filtro</div>
      <div data>le righe</div>
      <div overlays>un pannello di azione</div>
    </app-list-page>
  `,
})
class ConsumerVestiComponent {
  attivi = 0;
  readonly onAzzera = vi.fn();
}

async function montaVesti(opzioni: { compatta?: boolean; attivi?: number } = {}) {
  return render(ConsumerVestiComponent, {
    componentProperties: { attivi: opzioni.attivi ?? 0 },
    providers: [
      { provide: ViewportService, useValue: { compact: signal(opzioni.compatta ?? false) } },
    ],
  });
}

describe('ListPageComponent — le due vesti dei filtri', () => {
  it('⭐ `[overlays]` arriva nel DOM: senza slot Angular lo scarterebbe', async () => {
    await montaVesti();

    expect(screen.getByText('un pannello di azione')).toBeVisible();
  });

  it('⭐ `[period]` sta in barra, e ci resta anche nella veste compatta', async () => {
    await montaVesti({ compatta: true });

    const periodo = screen.getByText('periodo in barra');
    expect(periodo).toBeVisible();
    // ⚠️ Periodo e Ricerca non entrano nel pannello: sono i due esterni alle
    //    colonne (`14` §0.2). Se finisse dentro, sarebbe nascosto di default.
    expect(periodo.closest('.list-page__filters')).toBeNull();
  });

  it('⭐ il pannello nasce CHIUSO e «Filtri» lo apre', async () => {
    await montaVesti({ compatta: true });
    const pannello = document.querySelector('.list-page__filters');

    expect(pannello).not.toBeNull();
    expect(pannello?.classList.contains('list-page__filters--open')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));

    expect(pannello?.classList.contains('list-page__filters--open')).toBe(true);
    expect(pannello?.getAttribute('role')).toBe('dialog');
  });

  it('⛔ chiudere il pannello NON azzera: si perderebbe ciò che si è appena scelto', async () => {
    const { fixture } = await montaVesti({ compatta: true });
    const consumer = fixture.componentInstance;

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Vedi risultati' }));

    expect(document.querySelector('.list-page__filters--open')).toBeNull();
    expect(consumer.onAzzera).not.toHaveBeenCalled();
  });

  it('⭐ «Azzera filtri» del pannello azzera, ed è esplicito', async () => {
    const { fixture } = await montaVesti({ compatta: true });

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }));

    expect(fixture.componentInstance.onAzzera).toHaveBeenCalledTimes(1);
  });

  it('⭐ su scrivania spegnere «Filtri» AZZERA — ha preso il posto di «Azzera filtri»', async () => {
    const { fixture } = await montaVesti();
    const bottone = screen.getByRole('button', { name: /Filtri/ });

    await userEvent.click(bottone); // acceso: non azzera
    expect(fixture.componentInstance.onAzzera).not.toHaveBeenCalled();

    await userEvent.click(bottone); // spento: azzera
    expect(fixture.componentInstance.onAzzera).toHaveBeenCalledTimes(1);
  });

  it('⭐ il conteggio compare sul pulsante solo se c’è', async () => {
    await montaVesti({ attivi: 2 });

    expect(screen.getByRole('button', { name: /Filtri\s*\(2\)/ })).toBeVisible();
  });

  it('⭐ nella veste estesa i filtri NON sono un pannello', async () => {
    await montaVesti();
    const filtri = document.querySelector('.list-page__filters');

    expect(filtri?.classList.contains('list-page__filters--panel')).toBe(false);
    expect(filtri?.getAttribute('role')).toBeNull();
    expect(screen.getByText('un filtro')).toBeVisible();
  });
});
