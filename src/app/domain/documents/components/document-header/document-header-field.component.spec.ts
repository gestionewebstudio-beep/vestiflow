import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ViewportService } from '@core/services/viewport.service';

import { DocumentHeaderFieldComponent } from './document-header-field.component';

/**
 * ⭐ **Il campo di testata: una dichiarazione, due vesti.**
 *
 * ⛔ Anche questo non aveva prove, e la migrazione dell'Ordine cliente gli
 * chiede la capacità che gli mancava: rendere un `<label for>` vero.
 */
describe('DocumentHeaderFieldComponent', () => {
  async function monta(compatto: boolean, attributi: string, corpo = '<input id="prova-id" />') {
    return render(`<app-document-header-field ${attributi}>${corpo}</app-document-header-field>`, {
      imports: [DocumentHeaderFieldComponent],
      providers: [{ provide: ViewportService, useValue: { compact: signal(compatto) } }],
    });
  }

  it('⭐ con controlId l’etichetta è un <label for> VERO, e ci si clicca dentro', async () => {
    const { container } = await monta(false, 'label="Data documento" controlId="prova-id"');

    const etichetta = container.querySelector('label');
    expect(etichetta).not.toBeNull();
    expect(etichetta?.getAttribute('for')).toBe('prova-id');

    // ⚠️ La prova che conta non è l'attributo: è che il fuoco ci arrivi.
    await userEvent.setup().click(etichetta!);
    expect(document.activeElement).toBe(container.querySelector('#prova-id'));
  });

  it('⭐ e vale anche in vesta compatta, con la classe del pannello', async () => {
    const { container } = await monta(true, 'label="Data documento" controlId="prova-id"');

    const etichetta = container.querySelector('label');
    expect(etichetta?.getAttribute('for')).toBe('prova-id');
    expect(etichetta?.className).toBe('doc-panel__label');
  });

  it('⛔ senza controlId resta uno span: un for che punta al vuoto è peggio del niente', async () => {
    // ⚠️ È il caso dei menu a bottone (app-select-menu), che non hanno un id di
    // controllo e si annunciano con ariaLabel.
    const { container } = await monta(false, 'label="Cliente"', '<button>Scegli</button>');

    expect(container.querySelector('label')).toBeNull();
    expect(container.querySelector('.doc-form__label')?.textContent?.trim()).toBe('Cliente');
  });

  it('⭐ le classi dell’host cambiano con la vesta, non col chiamante', async () => {
    const scrivania = await monta(false, 'label="Cliente"');

    expect(scrivania.container.querySelector('app-document-header-field')?.className).toContain(
      'doc-form__field',
    );
  });

  it('⭐ span2 vale solo su scrivania: nel pannello non ci sono colonne da occupare', async () => {
    const viewport = signal(false);
    const { container, detectChanges } = await render(
      '<app-document-header-field label="Cliente" [span2]="true"><input /></app-document-header-field>',
      {
        imports: [DocumentHeaderFieldComponent],
        providers: [{ provide: ViewportService, useValue: { compact: viewport } }],
      },
    );
    const host = container.querySelector('app-document-header-field')!;
    expect(host.classList.contains('doc-form__field--span2')).toBe(true);

    viewport.set(true);
    detectChanges();

    expect(host.classList.contains('doc-form__field--span2')).toBe(false);
  });

  it('⭐ l’errore si rende col proprio id, ed è quello che il controllo cita', async () => {
    await monta(
      false,
      'label="Cliente" [invalid]="true" errorId="co-customer-error"',
      '<input aria-describedby="co-customer-error" />',
    );

    expect(screen.getByText('Campo obbligatorio.').id).toBe('co-customer-error');
  });
});
