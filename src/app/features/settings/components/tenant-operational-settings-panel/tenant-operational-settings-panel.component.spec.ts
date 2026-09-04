import { signal } from '@angular/core';
import { UnitOfMeasureOptionService } from '@domain/products/services/unit-of-measure-option.service';
import { ProfileRefreshService } from '@core/auth/profile-refresh.service';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { VatCodeService } from '@core/services/vat-code.service';
import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';
import type { TenantFeatureSettings } from '@domain/tenant/models/tenant-feature-settings.model';

import { TenantOperationalSettingsPanelComponent } from './tenant-operational-settings-panel.component';

const SETTINGS: TenantFeatureSettings = {
  salesPricesIncludeVat: true,
  lotsEnabled: false,
  serialsEnabled: false,
  variantsEnabled: true,
  barcodeScannerEnabled: true,
  supplierOrdersEnabled: true,
  goodsReceiptEnabled: true,
  warehouseValuationEnabled: true,
  allowNegativeInventory: false,
  warnNegativeInventory: true,
  blockNegativeInventory: false,
  manualUnloadEnabled: false,
  defaultVatCodeId: null,
  listino1Name: 'Ingrosso',
  listino1Active: true,
  listino2Name: null,
  listino2Active: false,
  listino3Name: null,
  listino3Active: false,
};

/** Elenco unita’ del tenant, con una predefinita: e’ lo stato normale. */
const UNITA = [
  { id: 'um-1', name: 'pz', sortOrder: 1, isSystem: true, isActive: true, isDefault: false },
  { id: 'um-2', name: 'kg', sortOrder: 2, isSystem: false, isActive: true, isDefault: true },
];

function setup(updateSettings = vi.fn(() => of(SETTINGS)), refreshNow = vi.fn()) {
  return render(TenantOperationalSettingsPanelComponent, {
    providers: [
      {
        provide: TenantFeatureSettingsService,
        useValue: { getSettings: () => of(SETTINGS), updateSettings },
      },
      { provide: VatCodeService, useValue: { list: () => of([]) } },
      // ⚠️ Dal 26/08/2026 il pannello rilegge il PROFILO dopo il salvataggio:
      //   alcune impostazioni sono capacita’ del tenant che viaggiano di li’, e
      //   senza rilettura l’interruttore appena girato non farebbe niente.
      { provide: ProfileRefreshService, useValue: { refreshNow } },
      // ⚠️ La predefinita U.M. e’ una proprieta’ dell’ELENCO, quindi il pannello
      //   legge il servizio delle opzioni. Stub: il servizio vero vorrebbe
      //   APP_CONFIG e il client HTTP, e questi test guardano altro.
      {
        provide: UnitOfMeasureOptionService,
        useValue: { options: () => signal(UNITA), reload: vi.fn() },
      },
    ],
  });
}

describe('TenantOperationalSettingsPanelComponent — listini', () => {
  it('mostra il nome dato dal tenant e il default come segnaposto', async () => {
    await setup();

    const listino1 = await screen.findByLabelText<HTMLInputElement>('Nome del listino 1');
    expect(listino1.value).toBe('Ingrosso');

    // Senza nome il campo resta vuoto: il segnaposto dice come si chiamera'.
    const listino2 = screen.getByLabelText<HTMLInputElement>('Nome del listino 2');
    expect(listino2.value).toBe('');
    expect(listino2.placeholder).toBe('Listino 2');
  });

  it('salva il nome, e svuotarlo lo riporta a null', async () => {
    const user = userEvent.setup();
    const updateSettings = vi.fn(() => of(SETTINGS));
    await setup(updateSettings);

    const listino1 = await screen.findByLabelText<HTMLInputElement>('Nome del listino 1');
    await user.clear(listino1);
    await user.type(listino1, 'Rivenditori');
    await user.click(screen.getByLabelText('Listino 2 attivo'));
    await user.click(screen.getByRole('button', { name: /salva impostazioni/i }));

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        listino1Name: 'Rivenditori',
        listino2Name: null,
        listino2Active: true,
      }),
    );
  });
});

/**
 * ⛔ **Il difetto che questa prova impedisce di far tornare — 26/08/2026.**
 *
 * Il titolare ha acceso la Vendita manuale in Impostazioni, il valore è andato
 * in tabella davvero, e **non è successo niente**: la funzione restava spenta.
 *
 * Perché: alcune impostazioni aziendali non sono solo dati, sono **capacità**
 * che viaggiano sul profilo utente (`/auth/me`). Il valore cambia in tabella
 * subito, ma la sessione continua a portare quello vecchio finché il profilo non
 * si rilegge — e nessuno lo rileggeva. Con la cache del profilo lato server
 * (60s) e il giro periodico del client (3 min), l'interruttore «funzionava»
 * dopo qualche minuto: cioè, per chi lo stava usando, non funzionava.
 *
 * ⚠️ La prova guarda la RILETTURA, non il salvataggio: il salvataggio non era
 * mai stato il problema, ed è per questo che il difetto era difficile da vedere.
 */
describe('TenantOperationalSettingsPanelComponent — la sessione si aggiorna', () => {
  it('⛔ dopo il salvataggio il profilo si rilegge, o l’impostazione non ha effetto', async () => {
    const refreshNow = vi.fn();
    await setup(
      vi.fn(() => of(SETTINGS)),
      refreshNow,
    );

    await userEvent.setup().click(await screen.findByRole('button', { name: /Salva/i }));

    expect(refreshNow).toHaveBeenCalledTimes(1);
  });

  it('⛔ e NON si rilegge se il salvataggio fallisce', async () => {
    // ⚠️ Rileggere dopo un errore mostrerebbe i valori vecchi come se fossero
    //   stati salvati: peggio del non fare niente.
    const refreshNow = vi.fn();
    await setup(
      vi.fn(() => throwError(() => new Error('rete'))),
      refreshNow,
    );

    await userEvent.setup().click(await screen.findByRole('button', { name: /Salva/i }));

    expect(refreshNow).not.toHaveBeenCalled();
  });
});

/**
 * ⭐ **La predefinita U.M. è una proprietà dell'elenco, e «nessuna» è valida.**
 *
 * ⛔ Qui c'era un campo di testo libero su `defaultUnitOfMeasure`, che nessuno
 * leggeva: si scollegava dall'elenco e non sapeva dire «nessuna», perché il suo
 * default era `pz`. Ora il pannello **legge** la voce marcata e apre il gestore.
 */
describe('TenantOperationalSettingsPanelComponent — unità di misura predefinita', () => {
  async function apri(unita: readonly unknown[]) {
    return render(TenantOperationalSettingsPanelComponent, {
      providers: [
        {
          provide: TenantFeatureSettingsService,
          useValue: { getSettings: () => of(SETTINGS), updateSettings: vi.fn(() => of(SETTINGS)) },
        },
        { provide: VatCodeService, useValue: { list: () => of([]) } },
        { provide: ProfileRefreshService, useValue: { refreshNow: vi.fn() } },
        {
          provide: UnitOfMeasureOptionService,
          useValue: { options: () => signal(unita), reload: vi.fn() },
        },
      ],
    });
  }

  it('⭐ mostra la voce marcata come predefinita', async () => {
    await apri(UNITA);

    expect(await screen.findByText('kg')).toBeInTheDocument();
  });

  it('⭐ senza nessuna marcata dice «Nessuna», e non inventa «pz»', async () => {
    // ⚠️ È lo stato che il proprietario ha chiesto di rendere possibile: chi ha
    //   articoli misti non deve dover cambiare l'unità ogni volta.
    await apri(UNITA.map((voce) => ({ ...voce, isDefault: false })));

    expect(await screen.findByText('Nessuna')).toBeInTheDocument();
  });

  it('⛔ e il campo di testo libero non esiste più', async () => {
    // Se tornasse, tornerebbero due predefinite che non si parlano.
    const { container } = await apri(UNITA);

    expect(container.querySelector('#tenant-ops-uom')).toBeNull();
  });
});
