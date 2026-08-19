import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
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
  defaultUnitOfMeasure: 'pz',
  defaultVatCodeId: null,
  listino1Name: 'Ingrosso',
  listino1Active: true,
  listino2Name: null,
  listino2Active: false,
  listino3Name: null,
  listino3Active: false,
};

function setup(updateSettings = vi.fn(() => of(SETTINGS))) {
  return render(TenantOperationalSettingsPanelComponent, {
    providers: [
      {
        provide: TenantFeatureSettingsService,
        useValue: { getSettings: () => of(SETTINGS), updateSettings },
      },
      { provide: VatCodeService, useValue: { list: () => of([]) } },
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
