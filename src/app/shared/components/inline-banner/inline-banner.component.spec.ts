import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InlineBannerComponent } from './inline-banner.component';

describe('InlineBannerComponent', () => {
  it('un errore interrompe la lettura: role="alert"', async () => {
    await render(InlineBannerComponent, {
      inputs: { tone: 'error', message: 'Connessione non riuscita' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Connessione non riuscita');
  });

  it('un avviso interrompe come l’errore: chi lo legge deve fermarsi', async () => {
    await render(InlineBannerComponent, { inputs: { tone: 'warning', message: 'Sync parziale' } });

    expect(screen.getByRole('alert')).toBeVisible();
  });

  it.each(['success', 'info', 'neutral'] as const)(
    'un messaggio «%s» aspetta la pausa: role="status"',
    async (tone) => {
      await render(InlineBannerComponent, { inputs: { tone, message: 'Fatto' } });

      expect(screen.getByRole('status')).toHaveTextContent('Fatto');
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('senza dismissLabel non c’e’ nulla da chiudere: un errore di fetch resta finche’ non si riprova', async () => {
    await render(InlineBannerComponent, { inputs: { message: 'Errore' } });

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('con dismissLabel il click notifica chi lo ospita, senza nascondersi da solo', async () => {
    const user = userEvent.setup();
    const dismissed = vi.fn();
    await render(InlineBannerComponent, {
      inputs: { tone: 'success', message: 'Negozio collegato', dismissLabel: 'Chiudi' },
      on: { dismissed },
    });

    await user.click(screen.getByRole('button', { name: 'Chiudi' }));

    expect(dismissed).toHaveBeenCalledTimes(1);
    // Resta nel DOM: e' il chiamante a decidere quando smettere di mostrarlo.
    expect(screen.getByRole('status')).toBeVisible();
  });

  /**
   * ⭐ I comandi che RISOLVONO (14/09/2026): proiettati con `actions`, stanno nel banner
   *    accanto al testo; senza contenuto proiettato lo spazio non esiste.
   */
  it('i comandi proiettati con «actions» stanno nel banner; senza, nessuno spazio vuoto', async () => {
    await render(
      `<app-inline-banner tone="warning">
        Mancano 2 notifiche.
        <button actions type="button">Registra</button>
      </app-inline-banner>`,
      { imports: [InlineBannerComponent] },
    );
    const avviso = screen.getByRole('alert');
    expect(avviso).toHaveTextContent('Mancano 2 notifiche.');
    const comando = screen.getByRole('button', { name: 'Registra' });
    expect(comando.closest('.inline-banner__actions')).not.toBeNull();
  });

  it('senza comandi lo slot resta vuoto', async () => {
    await render(InlineBannerComponent, { inputs: { tone: 'info', message: 'Solo testo' } });
    expect(document.querySelector('.inline-banner__actions')?.children).toHaveLength(0);
  });
});
