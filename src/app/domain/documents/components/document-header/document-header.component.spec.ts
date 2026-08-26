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
