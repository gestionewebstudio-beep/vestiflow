import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ViewportService } from '@core/services/viewport.service';

import type {
  ShopifySetupLocationDto,
  ShopifySetupSedeVestiFlowDto,
} from '../../models/shopify-setup.dto';
import { ShopifyLocationChoicesComponent } from './shopify-location-choices.component';

const LOCATIONS: readonly ShopifySetupLocationDto[] = [
  {
    shopifyLocationId: '11',
    name: 'Negozio centro',
    active: true,
    choice: null,
    locationId: null,
    locationName: null,
  },
  {
    shopifyLocationId: '22',
    name: 'Deposito',
    active: false,
    choice: 'collega',
    locationId: 'loc-2',
    locationName: 'Sede già presa',
  },
];

const SEDI: readonly ShopifySetupSedeVestiFlowDto[] = [
  { id: 'loc-1', name: 'Sede 1', code: 'S1', shopifyLocationId: null },
  { id: 'loc-2', name: 'Sede già presa', code: 'S2', shopifyLocationId: '22' },
];

async function apri(modificabile = true, compatta = false) {
  const sedeScelta = vi.fn();
  await render(ShopifyLocationChoicesComponent, {
    inputs: { locations: LOCATIONS, sedi: SEDI, modificabile },
    on: { sedeScelta },
    providers: [{ provide: ViewportService, useValue: { compact: signal(compatta) } }],
  });
  return sedeScelta;
}

describe('ShopifyLocationChoicesComponent — una scelta per location', () => {
  it('offre lascia, crea e le sole sedi libere (o già sue); emette la scelta', async () => {
    const utente = userEvent.setup();
    const sedeScelta = await apri();

    await utente.click(
      screen.getByRole('button', { name: /Scelta per la location Negozio centro/ }),
    );
    expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual([
      'Decidi…',
      'Lascia fuori da VestiFlow',
      'Crea la sede «Negozio centro»',
      'Collega a «Sede 1»',
    ]);
    await utente.click(screen.getByRole('option', { name: 'Lascia fuori da VestiFlow' }));
    expect(sedeScelta).toHaveBeenCalledWith({
      shopifyLocationId: '11',
      scelta: { choice: 'lascia' },
    });

    // La location già collegata propone la SUA sede, che altrove non si offre.
    await utente.click(screen.getByRole('button', { name: /Scelta per la location Deposito/ }));
    expect(screen.getByRole('option', { name: 'Collega a «Sede già presa»' })).toBeInTheDocument();
    await utente.click(screen.getByRole('option', { name: 'Collega a «Sede già presa»' }));
    expect(sedeScelta).toHaveBeenLastCalledWith({
      shopifyLocationId: '22',
      scelta: { choice: 'collega', locationId: 'loc-2' },
    });
  });

  /**
   * ⛔ Misurato sul negozio vero il 13/09/2026: la cella della scelta porta
   *    `overflow: hidden` (taglio a colonna della grammatica dei riepiloghi) e
   *    un pannello ASSOLUTO le restava dentro — nel DOM, 5 voci, «visibile», e
   *    al suo centro il browser vedeva il trigger della riga dopo. Da tastiera
   *    e da mouse non si sceglieva niente. Il pannello deve essere FISSO, come
   *    per i filtri di colonna del motore tabella; jsdom non ritaglia, quindi
   *    qui si tiene fermo il contratto, non la resa.
   */
  it('la tendina della scelta è a pannello fisso: la cella la ritaglierebbe', async () => {
    await apri();
    const menu = document.querySelectorAll('app-select-menu');
    expect(menu.length).toBe(LOCATIONS.length);
    for (const m of menu) {
      expect(m.classList.contains('select-menu-host--fixed')).toBe(true);
    }
  });

  /**
   * ⛔ Sul telefono le righe sono card e niente le ritaglia; il pannello fisso
   *    si chiude a ogni scorrimento e rendeva la scelta impossibile — misurato
   *    dalla prova a schermo del 13/09/2026: l'opzione «Crea la sede» spariva
   *    prima del tocco. Lì la tendina resta nel flusso.
   */
  it('sul telefono (vista a card) la tendina NON è a pannello fisso', async () => {
    await apri(true, true);
    const menu = document.querySelectorAll('app-select-menu');
    expect(menu.length).toBe(LOCATIONS.length);
    for (const m of menu) {
      expect(m.classList.contains('select-menu-host--fixed')).toBe(false);
    }
  });

  it('in sola lettura dice la scelta fatta, senza tendine', async () => {
    await apri(false);

    expect(screen.queryByRole('button', { name: /Scelta per la location/ })).toBeNull();
    expect(screen.getByText('Collegata a Sede già presa')).toBeVisible();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    // La sede VestiFlow è distinta dallo stato su Shopify.
    expect(screen.getByRole('columnheader', { name: 'Su Shopify' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Sede VestiFlow' })).toBeVisible();
  });

  it('senza location lo dice', async () => {
    await render(ShopifyLocationChoicesComponent, {
      inputs: { locations: [], sedi: SEDI },
    });
    expect(screen.getByText('Nessuna location letta da Shopify.')).toBeVisible();
  });
});
