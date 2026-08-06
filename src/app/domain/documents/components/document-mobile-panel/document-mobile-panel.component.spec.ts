import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DocumentMobilePanelComponent } from './document-mobile-panel.component';

describe('DocumentMobilePanelComponent', () => {
  it('mostra titolo e voci del riepilogo nel head', async () => {
    await render(DocumentMobilePanelComponent, {
      inputs: {
        title: 'Dettagli documento',
        summaryParts: ['25/07/2026', 'Confermato', 'Pagamento non indicato'],
        icon: 'pi-calendar',
      },
    });

    expect(screen.getByRole('button', { name: /Dettagli documento/ })).toBeInTheDocument();
    expect(screen.getByText('25/07/2026')).toBeInTheDocument();
    expect(screen.getByText('Pagamento non indicato')).toBeInTheDocument();
  });

  it('chiuso di default: aria-expanded false, il tap sul head lo apre', async () => {
    await render(DocumentMobilePanelComponent, {
      inputs: { title: 'Cliente e magazzino', icon: 'pi-user' },
    });

    const toggle = screen.getByRole('button', { name: /Cliente e magazzino/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.setup().click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('initiallyOpen: parte aperto e il toggle lo richiude', async () => {
    await render(DocumentMobilePanelComponent, {
      inputs: { title: 'Cliente e magazzino', icon: 'pi-user', initiallyOpen: true },
    });

    const toggle = screen.getByRole('button', { name: /Cliente e magazzino/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await userEvent.setup().click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('proietta il corpo del chiamante dentro il pannello', async () => {
    await render(
      `<app-document-mobile-panel title="Cliente e magazzino" icon="pi-user" [initiallyOpen]="true">
        <p>Campi del documento</p>
      </app-document-mobile-panel>`,
      { imports: [DocumentMobilePanelComponent] },
    );

    expect(screen.getByText('Campi del documento')).toBeInTheDocument();
  });

  it('statusText: riga di stato con dot ambra, verde quando statusReady', async () => {
    // Aperto: la riga di stato sta nel corpo, chiuso non è in accessibility tree.
    const { container, rerender } = await render(DocumentMobilePanelComponent, {
      inputs: {
        title: 'Cliente e magazzino',
        icon: 'pi-user',
        statusText: 'Cliente e location sono obbligatori.',
        statusReady: false,
        initiallyOpen: true,
      },
    });

    expect(screen.getByRole('status')).toHaveTextContent('Cliente e location sono obbligatori.');
    expect(container.querySelector('.doc-panel__status--ready')).toBeNull();

    await rerender({
      inputs: {
        title: 'Cliente e magazzino',
        icon: 'pi-user',
        statusText: 'Dati principali completi.',
        statusReady: true,
        initiallyOpen: true,
      },
    });

    expect(container.querySelector('.doc-panel__status--ready')).not.toBeNull();
  });

  it('senza statusText non rende alcuna riga di stato', async () => {
    await render(DocumentMobilePanelComponent, {
      inputs: { title: 'Dettagli documento', icon: 'pi-calendar' },
    });

    expect(screen.queryByRole('status')).toBeNull();
  });
});
