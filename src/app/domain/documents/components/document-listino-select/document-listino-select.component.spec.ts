import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TenantFeatureSettings } from '@domain/tenant/models/tenant-feature-settings.model';

import { DocumentListinoSelectComponent } from './document-listino-select.component';
import type { DocumentListinoChoice } from '../../utils/document-listino.util';

/**
 * ⭐ **Il contratto del selettore listino di testata.**
 *
 * Le prove coprono le due cose per cui il componente esiste: che le opzioni
 * vengano dai listini **attivi del tenant**, e che il controllo **non si
 * mostri** quando non c'è niente da scegliere.
 *
 * ⛔ Non provano l'effetto — riscrivere i prezzi delle righe — perché non è suo:
 * le due maschere lo fanno in modo diverso, e ognuna prova il proprio.
 */
describe('DocumentListinoSelectComponent', () => {
  function impostazioni(attivi: readonly number[]): TenantFeatureSettings {
    return {
      listino1Active: attivi.includes(1),
      listino1Name: 'Ingrosso',
      listino2Active: attivi.includes(2),
      listino2Name: 'Rivenditori',
      listino3Active: attivi.includes(3),
      listino3Name: 'Outlet',
    } as unknown as TenantFeatureSettings;
  }

  async function monta(opzioni?: {
    readonly attivi?: readonly number[];
    readonly choice?: DocumentListinoChoice;
    readonly readOnly?: boolean;
    readonly onChange?: (scelta: DocumentListinoChoice) => void;
  }) {
    const choiceChange = vi.fn(opzioni?.onChange);
    const view = await render(DocumentListinoSelectComponent, {
      inputs: {
        settings: impostazioni(opzioni?.attivi ?? [1]),
        choice: opzioni?.choice ?? 'article',
        readOnly: opzioni?.readOnly ?? false,
      },
      on: { choiceChange },
    });
    return { ...view, choiceChange };
  }

  const tendina = () => screen.getByRole('button', { name: 'Listino applicato alle righe' });

  it('⭐ mostra i listini ATTIVI del tenant, più il prezzo di vendita', async () => {
    const user = userEvent.setup();
    await monta({ attivi: [1, 3] });

    await user.click(tendina());

    expect(screen.getByRole('option', { name: 'Prezzo di vendita' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Ingrosso' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Outlet' })).toBeTruthy();
    // ⛔ Spento per quel tenant significa che NON ESISTE, non che è disabilitato.
    expect(screen.queryByRole('option', { name: 'Rivenditori' })).toBeNull();
  });

  it('⛔ senza nessun listino attivo il controllo NON si mostra', async () => {
    // ⚠️ L'elenco porta sempre «Prezzo di vendita»: una sola opzione significa
    // «nessun listino acceso», e un controllo che non può cambiare niente è
    // rumore in una testata già densa.
    await monta({ attivi: [] });

    expect(screen.queryByRole('button', { name: 'Listino applicato alle righe' })).toBeNull();
  });

  it('⭐ mostra la scelta corrente del documento', async () => {
    await monta({ attivi: [1, 2], choice: 2 });

    expect(tendina().textContent).toContain('Rivenditori');
  });

  it('⭐ e la scelta esce TIPIZZATA, non come testo', async () => {
    // Il chiamante riceve `1 | 2 | 3 | 'article'`, non la stringa della tendina:
    // la traduzione sta in un posto solo.
    const user = userEvent.setup();
    const { choiceChange } = await monta({ attivi: [1, 2] });

    await user.click(tendina());
    await user.click(screen.getByRole('option', { name: 'Rivenditori' }));

    expect(choiceChange).toHaveBeenCalledWith(2);
  });

  it('⛔ in sola lettura il controllo NON si mostra', async () => {
    // ⚠️ Non «disabilitato»: e' il comportamento che le due maschere avevano
    // gia' — `@if (… && !formReadOnly())` — ed e' anche l'unico possibile,
    // perche' `app-select-menu` non ha un ingresso `disabled`.
    await monta({ attivi: [1, 2], readOnly: true });

    expect(screen.queryByRole('button', { name: 'Listino applicato alle righe' })).toBeNull();
  });
});
