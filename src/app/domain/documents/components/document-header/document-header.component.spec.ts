import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { ViewportService } from '@core/services/viewport.service';

import { DocumentHeaderComponent } from './document-header.component';

/**
 * ⭐ **La testata comune: una dichiarazione, due vesti, mai due istanze.**
 *
 * ⛔ Questo componente non aveva prove, e ci poggiano sette maschere. La
 * migrazione dell'Ordine cliente ne aggiunge l'ottava e gli chiede una capacità
 * nuova (il piede del pannello): entrambe le cose vanno inchiodate qui, non
 * nella maschera che le usa per prima.
 *
 * ⚠️ **La prova che conta di più è quella sul cambio di viewport.** Il difetto
 * che questo componente esiste per chiudere non è «il campo manca»: è «il campo
 * c'è due volte», e si vede solo attraversando la soglia. Un controllo doppio
 * compila, passa ogni prova statica, e a schermo dà due comandi identici.
 */
describe('DocumentHeaderComponent', () => {
  /** Il viewport pilotabile: è l'unico ingresso che decide la vesta. */
  function compatto(iniziale: boolean) {
    return signal(iniziale);
  }

  const CORPO = `<p class="campo-di-prova">Cliente</p>`;

  async function monta(compact: ReturnType<typeof compatto>, contenuto = CORPO, attributi = '') {
    return render(`<app-document-header ${attributi}>${contenuto}</app-document-header>`, {
      imports: [DocumentHeaderComponent],
      providers: [{ provide: ViewportService, useValue: { compact } }],
    });
  }

  it('⭐ su scrivania rende la griglia, e il pannello non esiste', async () => {
    const { container } = await monta(compatto(false));

    expect(container.querySelector('.doc-form__grid--header')).not.toBeNull();
    expect(container.querySelector('.doc-panel')).toBeNull();
    expect(container.querySelectorAll('.campo-di-prova')).toHaveLength(1);
  });

  it('⭐ su schermo compatto rende il pannello, e la griglia non esiste', async () => {
    const { container } = await monta(compatto(true), CORPO, 'title="Dati" icon="pi-user"');

    expect(container.querySelector('.doc-panel')).not.toBeNull();
    expect(container.querySelector('.doc-form__grid--header')).toBeNull();
    expect(container.querySelectorAll('.campo-di-prova')).toHaveLength(1);
  });

  it('⛔ attraversando la soglia il campo non si duplica MAI, in nessuno dei due versi', async () => {
    // ⚠️ È la prova richiesta dal proprietario il 26/08/2026: desktop → mobile →
    // desktop. Con le due vesti vive insieme (o nascoste col CSS) il conteggio
    // qui salirebbe a 2, ed è esattamente il difetto da impedire.
    const viewport = compatto(false);
    const { container, detectChanges } = await monta(
      viewport,
      CORPO,
      'title="Dati" icon="pi-user"',
    );

    expect(container.querySelectorAll('.campo-di-prova')).toHaveLength(1);
    expect(container.querySelector('.doc-panel')).toBeNull();

    viewport.set(true);
    detectChanges();

    expect(container.querySelectorAll('.campo-di-prova')).toHaveLength(1);
    expect(container.querySelector('.doc-form__grid--header')).toBeNull();

    viewport.set(false);
    detectChanges();

    expect(container.querySelectorAll('.campo-di-prova')).toHaveLength(1);
    expect(container.querySelector('.doc-panel')).toBeNull();
  });

  it('⭐ il piede si proietta nel pannello, dopo i campi', async () => {
    const { container } = await monta(
      compatto(true),
      `${CORPO}<div panelFooter class="piede-di-prova">Origine delle righe</div>`,
      'title="Dati" icon="pi-user"',
    );

    const piede = container.querySelector('.piede-di-prova');
    expect(piede).not.toBeNull();
    // ⛔ Fuori dalla griglia dei campi: dentro, si incolonnerebbe come se fosse
    // un campo, e non lo è.
    expect(piede?.closest('.doc-panel__fields')).toBeNull();
    expect(screen.getByText('Origine delle righe')).toBeInTheDocument();
  });

  it('⛔ su scrivania il piede NON si rende: senza pannello non esiste un piede di pannello', async () => {
    // ⚠️ Non è una dimenticanza ed è la ragione del nome: `panelFooter` è del
    // PANNELLO. Su scrivania i campi si vedono tutti insieme, e ciò che sul
    // telefono accompagna un pannello apribile lì non ha di che accompagnarsi.
    const { container } = await monta(
      compatto(false),
      `${CORPO}<div panelFooter class="piede-di-prova">Origine delle righe</div>`,
    );

    expect(container.querySelector('.piede-di-prova')).toBeNull();
    expect(container.querySelectorAll('.campo-di-prova')).toHaveLength(1);
  });

  it('⛔ il piede non finisce fra i campi nemmeno quando la vesta cambia', async () => {
    const viewport = compatto(true);
    const { container, detectChanges } = await monta(
      viewport,
      `${CORPO}<div panelFooter class="piede-di-prova">Origine</div>`,
      'title="Dati" icon="pi-user"',
    );

    expect(container.querySelectorAll('.piede-di-prova')).toHaveLength(1);

    viewport.set(false);
    detectChanges();
    expect(container.querySelectorAll('.piede-di-prova')).toHaveLength(0);

    viewport.set(true);
    detectChanges();
    expect(container.querySelectorAll('.piede-di-prova')).toHaveLength(1);
    expect(container.querySelector('.piede-di-prova')?.closest('.doc-panel__fields')).toBeNull();
  });

  it('⭐ il titoletto di sezione appare solo a pannello, e solo se dichiarato', async () => {
    const { container } = await monta(
      compatto(true),
      CORPO,
      'title="Dati" icon="pi-user" sectionTitle="Dati principali"',
    );

    expect(container.querySelector('.doc-panel__section')?.textContent?.trim()).toBe(
      'Dati principali',
    );
  });

  it('⭐ le classi della fascia scrivania seguono dense, flowRow e secondary', async () => {
    const { container } = await monta(
      compatto(false),
      CORPO,
      '[dense]="true" [flowRow]="true" [secondary]="true"',
    );

    const griglia = container.querySelector('.doc-form__grid--header');
    expect(griglia?.classList.contains('doc-form__grid--header-compact')).toBe(true);
    expect(griglia?.classList.contains('doc-form__header-row')).toBe(true);
    expect(griglia?.classList.contains('doc-form__header-row--secondary')).toBe(true);
  });

  it('⭐ titolo, riepilogo e stato arrivano al pannello', async () => {
    await monta(
      compatto(true),
      CORPO,
      'title="Cliente e magazzino" icon="pi-user" [summaryParts]="[\'26/08/2026\',\'Confermato\']" ' +
        'statusText="Cliente e location sono obbligatori." [initiallyOpen]="true"',
    );

    expect(screen.getByRole('button', { name: /Cliente e magazzino/ })).toBeInTheDocument();
    expect(screen.getByText('26/08/2026')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cliente e location sono obbligatori.');
  });
});

/**
 * ⚠️ **La proiezione per selettore e il control flow: una trappola misurata.**
 *
 * `<ng-content select="[panelFooter]">` abbina i nodi **dichiarati al primo
 * livello** del contenuto. Un elemento avvolto in un `@if` sta dentro una vista
 * incorporata, non al primo livello — e la domanda «viene proiettato lo stesso?»
 * non è deducibile leggendo il codice.
 *
 * ⛔ Conta perché è esattamente la forma che il chiamante scriverebbe per
 * primo: oggi il blocco «Origine delle righe» dell'Ordine cliente vive dentro
 * `@if (compactView() && includeSourceKinds.length > 0)`. Se la proiezione non
 * lo agganciasse, il piede sparirebbe **in silenzio** — nessun errore, nessun
 * test rosso, solo un pezzo di testata che non c'è più.
 *
 * Queste due prove inchiodano la risposta, qualunque sia, così che chi arriva
 * dopo la legga invece di riscoprirla.
 */
describe('DocumentHeaderComponent — piede e control flow', () => {
  async function monta(corpo: string) {
    return render(
      `<app-document-header title="Dati" icon="pi-user">${corpo}</app-document-header>`,
      {
        imports: [DocumentHeaderComponent],
        providers: [{ provide: ViewportService, useValue: { compact: signal(true) } }],
      },
    );
  }

  it('⭐ la forma SICURA: un solo elemento col marcatore, i condizionali dentro', async () => {
    // È la forma raccomandata, e quella che la maschera deve usare.
    const { container } = await monta(
      '<p class="campo">Cliente</p>' +
        '<div panelFooter class="piede">@if (true) { <span class="dentro">Origine</span> }</div>',
    );

    expect(container.querySelector('.piede')).not.toBeNull();
    expect(container.querySelector('.dentro')).not.toBeNull();
  });

  it('⚠️ il marcatore DENTRO un @if: ecco cosa fa davvero', async () => {
    const { container } = await monta(
      '<p class="campo">Cliente</p>' +
        '@if (true) { <div panelFooter class="piede-condizionale">Origine</div> }',
    );

    // ⚠️ Angular proietta comunque: il nodo conserva il proprio slot anche
    // dentro una vista incorporata. Se un giorno questa prova diventasse rossa,
    // la forma sicura qui sopra resta quella da usare — non è un ripiego.
    expect(container.querySelector('.piede-condizionale')).not.toBeNull();
    expect(
      container.querySelector('.piede-condizionale')?.closest('.doc-panel__fields'),
    ).toBeNull();
  });
});
