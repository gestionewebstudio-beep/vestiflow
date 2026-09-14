import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelectMenuComponent } from './select-menu.component';
import type { SelectMenuOption } from './select-menu.model';

async function apri(options: readonly SelectMenuOption[]) {
  const utente = userEvent.setup();
  const valueChange = vi.fn();
  await render(SelectMenuComponent, {
    inputs: { options, ariaLabel: 'Prova', placeholder: 'Scegli…' },
    on: { valueChange },
  });
  await utente.click(screen.getByRole('button', { name: 'Prova' }));
  return { utente, valueChange };
}

/** I nomi delle voci come li annuncia un lettore di schermo. */
function nomiDelleVoci(): string[] {
  return screen
    .getAllByRole('option')
    .map((voce) => voce.getAttribute('aria-label') ?? voce.textContent?.trim() ?? '');
}

/**
 * ⛔ Il nome accessibile di una voce con dettaglio era «etichetta, SKU dettaglio»:
 *    il prefisso apparteneva alla PRIMA voce con dettaglio (le varianti) ed era
 *    rimasto quando il dettaglio è diventato un'aliquota IVA, «Fornitore» /
 *    «Cliente» e la spiegazione di una scelta sulle sedi — «SKU 22% ordinaria»,
 *    «SKU Fornitore». Dal 14/09/2026 è «etichetta, dettaglio», per ogni uso: chi
 *    vuole la parola «SKU» la mette nel testo.
 */
describe('SelectMenuComponent — il nome accessibile delle voci', () => {
  it('una voce senza dettaglio si chiama con la sola etichetta', async () => {
    await apri([{ value: 'a', label: 'Milano' }]);
    expect(nomiDelleVoci()).toEqual(['Scegli…', 'Milano']);
  });

  it('una voce con dettaglio si chiama «etichetta, dettaglio», senza prefissi inventati', async () => {
    await apri([
      // Una variante: il dettaglio porta i codici, e il primo è lo SKU.
      { value: 'v1', label: 'Maglia cotone — M / Rosso', detail: 'MAG-M-R · EAN 8001234567890' },
      // Un Codice IVA: il dettaglio è la descrizione.
      { value: 'iva22', label: '22', detail: '22% ordinaria' },
      // Una controparte del movimento di magazzino.
      { value: 'f1', label: 'Rossi Srl', detail: 'Fornitore' },
      // Una scelta sulle sedi Shopify.
      {
        value: 'lascia',
        label: 'Lascia fuori da VestiFlow',
        detail: 'nessuna sede: non risulta da configurare',
      },
    ]);
    const nomi = nomiDelleVoci();
    expect(nomi).toEqual([
      'Scegli…',
      'Maglia cotone — M / Rosso, MAG-M-R · EAN 8001234567890',
      '22, 22% ordinaria',
      'Rossi Srl, Fornitore',
      'Lascia fuori da VestiFlow, nessuna sede: non risulta da configurare',
    ]);
    expect(nomi.some((nome) => /SKU/.test(nome))).toBe(false);
  });

  it('il dettaglio si vede sotto l’etichetta, e la scelta emette il valore', async () => {
    const { utente, valueChange } = await apri([
      { value: 'f1', label: 'Rossi Srl', detail: 'Fornitore' },
    ]);
    expect(screen.getByText('Fornitore')).toBeVisible();
    await utente.click(screen.getByRole('option', { name: 'Rossi Srl, Fornitore' }));
    expect(valueChange).toHaveBeenCalledWith('f1');
  });
});
