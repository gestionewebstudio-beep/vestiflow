import { signal } from '@angular/core';
import { render } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { ViewportService } from '@core/services/viewport.service';

import { DocumentHeaderGroupComponent } from './document-header-group.component';

/**
 * ⭐ **Il raggruppatore esiste per NON cambiare la vista mobile.**
 *
 * ⛔ `twoColumns` di `app-document-header` è tutto-o-niente. La testata
 * dell'Ordine cliente affianca solo Data, Stato e Consegna e impila gli altri
 * cinque campi: accendere `twoColumns` sull'intero pannello avrebbe affiancato
 * anche quelli, cioè cambiato proprio la vista scelta come riferimento.
 */
describe('DocumentHeaderGroupComponent', () => {
  const CORPO = '<span class="uno">A</span><span class="due">B</span>';

  async function monta(compatto: boolean, attributi = '') {
    return render(`<app-document-header-group ${attributi}>${CORPO}</app-document-header-group>`, {
      imports: [DocumentHeaderGroupComponent],
      providers: [{ provide: ViewportService, useValue: { compact: signal(compatto) } }],
    });
  }

  it('⭐ in vesta compatta è la griglia a due colonne del pannello', async () => {
    const { container } = await monta(true);
    const host = container.querySelector('app-document-header-group')!;

    expect(host.classList.contains('doc-panel__fields')).toBe(true);
    expect(host.classList.contains('doc-panel__fields--two')).toBe(true);
  });

  it('⛔ su scrivania NON porta nessuna classe: è trasparente, non un contenitore', async () => {
    // ⚠️ Con una classe di contenitore le tre celle diventerebbero UNA cella
    // della fascia che ne contiene tre. `display: contents` le fa salire al
    // livello della fascia, dove sono celle come le altre.
    const { container } = await monta(false);

    expect(container.querySelector('app-document-header-group')!.className).toBe('');
  });

  it('⭐ i campi proiettati restano figli dell’host in tutte e due le vesti', async () => {
    const compatta = await monta(true);

    const host = compatta.container.querySelector('app-document-header-group')!;
    expect(host.querySelectorAll('.uno')).toHaveLength(1);
    expect(host.querySelectorAll('.due')).toHaveLength(1);
  });

  it('⭐ spegnere twoColumns lascia la griglia semplice, non toglie il gruppo', async () => {
    const { container } = await monta(true, '[twoColumns]="false"');
    const host = container.querySelector('app-document-header-group')!;

    expect(host.classList.contains('doc-panel__fields')).toBe(true);
    expect(host.classList.contains('doc-panel__fields--two')).toBe(false);
  });

  it('⛔ e attraversando la soglia i campi non si duplicano', async () => {
    const viewport = signal(true);
    const { container, detectChanges } = await render(
      `<app-document-header-group>${CORPO}</app-document-header-group>`,
      {
        imports: [DocumentHeaderGroupComponent],
        providers: [{ provide: ViewportService, useValue: { compact: viewport } }],
      },
    );

    expect(container.querySelectorAll('.uno')).toHaveLength(1);

    viewport.set(false);
    detectChanges();

    expect(container.querySelectorAll('.uno')).toHaveLength(1);
  });
});
