import { fireEvent, render, screen } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';

import type { ListAction } from '@shared/models/list-selection.model';

import { ListActionsBarComponent } from './list-actions-bar.component';

async function apri(opzioni: {
  count: number;
  ids?: readonly string[];
  actions: readonly ListAction[];
}) {
  return render(ListActionsBarComponent, {
    inputs: {
      count: opzioni.count,
      ids: opzioni.ids ?? [],
      actions: opzioni.actions,
      labelSingular: 'documento selezionato',
      labelPlural: 'documenti selezionati',
    },
  });
}

const stampa = (run = vi.fn(), extra: Partial<ListAction> = {}): ListAction =>
  ({ id: 'print', label: 'Stampa', requires: 'none', run, ...extra }) as ListAction;

/**
 * ⛔ La barra è **dumb**: non sa che cosa siano Stampa, Excel o Esporta. Queste
 * prove verificano il contratto, non le azioni.
 */
describe('ListActionsBarComponent', () => {
  /**
   * ⭐ La regola che ha sostituito la barra contestuale: **i comandi non
   * compaiono con la selezione, ci sono sempre** (`14` §5.1). Prima la barra si
   * mostrava solo con almeno una riga scelta, e a zero selezionati le azioni non
   * si vedevano affatto.
   */
  it('⭐ con zero selezionati le azioni SONO visibili', async () => {
    await apri({ count: 0, actions: [stampa()] });

    expect(screen.getByRole('toolbar')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Stampa/ })).toBeTruthy();
  });

  it('l’indicatore di selezione compare solo quando serve', async () => {
    const { rerender } = await apri({ count: 0, actions: [stampa()] });
    expect(screen.getByRole('toolbar')).not.toHaveTextContent('documenti selezionati');

    await rerender({
      inputs: {
        count: 3,
        ids: ['a', 'b', 'c'],
        actions: [stampa()],
        labelSingular: 'documento selezionato',
        labelPlural: 'documenti selezionati',
      },
    });
    expect(screen.getByRole('toolbar')).toHaveTextContent('documenti selezionati');
  });

  describe("l'ambito segue la selezione (`14` §5.3)", () => {
    it('⭐ senza selezione l’azione riceve «filtered»', async () => {
      const run = vi.fn();
      await apri({ count: 0, ids: [], actions: [stampa(run)] });

      fireEvent.click(screen.getByRole('button', { name: /Stampa/ }));

      expect(run).toHaveBeenCalledWith({ scope: 'filtered' });
    });

    it('con selezione riceve gli ID', async () => {
      const run = vi.fn();
      await apri({ count: 2, ids: ['id-1', 'id-2'], actions: [stampa(run)] });

      fireEvent.click(screen.getByRole('button', { name: /Stampa/ }));

      expect(run).toHaveBeenCalledWith({ scope: 'selection', ids: ['id-1', 'id-2'] });
    });
  });

  describe('disabilitata con la sua ragione', () => {
    const elimina = (run = vi.fn()): ListAction => ({
      id: 'delete',
      label: 'Elimina',
      requires: 'oneOrMore',
      run,
    });

    /**
     * ⛔ Il motivo standard lo produce il CONTRATTO, non la pagina: scritto da
     * ogni pagina diventerebbe la stessa frase in tre sfumature.
     */
    it('⛔ il motivo di arità arriva dal contratto comune', async () => {
      await apri({ count: 0, actions: [elimina()] });

      expect(screen.getByRole('button', { name: /Elimina/ })).toBeTruthy();
      expect(screen.getByText('Seleziona almeno un elemento')).toBeTruthy();
    });

    /**
     * ⭐ Il pulsante spento resta **focusabile**: con il `disabled` nativo
     * uscirebbe dal giro del Tab e la ragione non sarebbe raggiungibile da
     * tastiera in nessun modo (`14` §11).
     */
    it('⭐ resta raggiungibile da tastiera e si descrive', async () => {
      await apri({ count: 0, actions: [elimina()] });
      const bottone = screen.getByRole('button', { name: /Elimina/ });

      expect(bottone.getAttribute('aria-disabled')).toBe('true');
      expect(bottone.hasAttribute('disabled')).toBe(false);
      const descritto = bottone.getAttribute('aria-describedby');
      expect(descritto).toBeTruthy();
      expect(document.getElementById(descritto ?? '')?.textContent).toContain(
        'Seleziona almeno un elemento',
      );
    });

    it('e non parte se premuta', async () => {
      const run = vi.fn();
      await apri({ count: 0, actions: [elimina(run)] });

      fireEvent.click(screen.getByRole('button', { name: /Elimina/ }));

      expect(run).not.toHaveBeenCalled();
    });
  });

  /** Le varianti stanno in UN menu, non in tre pulsanti (`14` §5.2). */
  it('un’azione con varianti diventa un menu, e la voce riceve il bersaglio', async () => {
    const csv = vi.fn();
    const actions: readonly ListAction[] = [
      {
        id: 'export',
        label: 'Esporta',
        requires: 'none',
        items: [{ id: 'csv', label: 'CSV (.csv)', run: csv }],
      },
    ];
    await apri({ count: 2, ids: ['id-1', 'id-2'], actions });

    fireEvent.click(screen.getByRole('button', { name: /Esporta/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /CSV/ }));

    expect(csv).toHaveBeenCalledWith({ scope: 'selection', ids: ['id-1', 'id-2'] });
  });

  it('«Deseleziona» emette', async () => {
    const { fixture } = await apri({ count: 2, ids: ['a', 'b'], actions: [stampa()] });
    const emesso = vi.fn();
    fixture.componentInstance.cleared.subscribe(emesso);

    fireEvent.click(screen.getByRole('button', { name: 'Deseleziona' }));

    expect(emesso).toHaveBeenCalled();
  });
});
