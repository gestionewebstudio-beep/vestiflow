import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { AuthService } from '@core/auth';
import { OnlineSaleInventoryStatus } from '@core/models/sales-order.model';
import { UserRole } from '@core/models/user.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';

import type { OnlineSaleRow } from './models/online-sale.model';
import { OnlineSaleListComponent } from './online-sale-list.component';
import { OnlineSalesService } from './services/online-sales.service';

/**
 * ⚠️ **L'elenco Vendite online non aveva NESSUN test** fino al 30/08/2026, e la
 * sua tabella era scritta a mano nel template. Portandola sul motore comune si
 * è scoperto che nulla teneva ferme le colonne: chi ne avesse tolta una — o le
 * avesse rinominate — non avrebbe visto rosso da nessuna parte.
 */

const VENDITA: OnlineSaleRow = {
  id: 'os-1',
  reference: 'VO-2026-0007',
  channel: 'online',
  channelLabel: 'Shopify online',
  salesOrderId: 'so-1',
  orderNumber: '#1042',
  customerName: 'Mario Rossi',
  orderPlacedAt: '2026-08-20T08:00:00.000Z',
  fulfilledAt: '2026-08-21T09:30:00.000Z',
  currency: DEFAULT_CURRENCY,
  totalMinor: 2500,
  paymentStatus: 'paid',
  inventoryStatus: OnlineSaleInventoryStatus.Unloaded,
  refundedAt: null,
  locationName: 'Magazzino test 3',
  ddtReference: 'DDT-2026-0003',
};

async function renderElenco(vendite: readonly OnlineSaleRow[] = [VENDITA]) {
  return render(OnlineSaleListComponent, {
    providers: [
      provideRouter([]),
      {
        provide: APP_CONFIG,
        useValue: {
          production: false,
          appName: 'VestiFlow',
          apiBaseUrl: '',
          features: { barcodeScanner: false, shopify: false },
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap({}) },
          queryParamMap: of(convertToParamMap({})),
        },
      },
      {
        provide: AuthService,
        useValue: { currentUser: () => ({ role: UserRole.Owner, permissions: [] }) },
      },
      {
        provide: OnlineSalesService,
        useValue: {
          getOnlineSales: () =>
            of({
              data: vendite,
              meta: { page: 1, pageSize: 20, total: vendite.length, totalPages: 1 },
            }),
        },
      },
    ],
  });
}

describe('OnlineSaleListComponent', () => {
  it('mostra le colonne dichiarate nella configurazione, non quelle scritte a mano', async () => {
    await renderElenco();

    for (const intestazione of [
      'Numero',
      'Canale',
      'Ordine origine',
      'Data evasione',
      'Cliente',
      'Sede',
      'Totale',
      'Stato magazzino',
      'DDT',
      'Rimborso',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: new RegExp(`^${intestazione}$`, 'i') }),
      ).toBeTruthy();
    }
  });

  it('la sede si chiama «Sede», mai «Location»', async () => {
    await renderElenco();

    expect(screen.queryByRole('columnheader', { name: /location/i })).toBeNull();
  });

  /**
   * ⚠️ **I valori compaiono DUE volte, ed è corretto**: la riga ha due vesti — le
   * celle vere e la card progettata (`appRowCard`), che sotto `lg` prende il
   * posto della tabella. Da qui il `getAllByText`: cercarne uno solo sarebbe
   * chiedere che una delle due vesti non esista.
   */
  it('rende i valori della riga passando per il motore comune', async () => {
    await renderElenco();

    for (const valore of [
      'VO-2026-0007',
      '#1042',
      'Mario Rossi',
      'Magazzino test 3',
      'DDT-2026-0003',
    ]) {
      expect(screen.getAllByText(valore).length, `manca «${valore}»`).toBeGreaterThan(0);
    }
  });

  /**
   * ⛔ **Le due vesti sono un difetto di accessibilità se i ruoli non si
   * dividono**: senza, uno screen reader annuncerebbe ogni riga DUE volte.
   *
   * ⭐ La divisione la fa il motore: la cella che ospita la card porta
   * `aria-hidden` — è una veste, non un dato — mentre le celle vere restano
   * nell'albero accessibile e sotto `lg` spariscono solo alla vista.
   *
   * ⚠️ **Non si vede a schermo e nessun controllo di layout lo trova.**
   */
  it('⭐ la card è una VESTE: porta aria-hidden, le celle vere no', async () => {
    const { container } = await renderElenco();

    const card = container.querySelector('td.data-table__card');
    expect(card, 'la card progettata non è resa').toBeTruthy();
    expect(card?.getAttribute('aria-hidden')).toBe('true');

    // La cella vera dello stesso valore non è nascosta all'albero accessibile.
    const celle = [...container.querySelectorAll('tbody td:not(.data-table__card)')];
    const cellaNumero = celle.find((c) => c.textContent?.includes('VO-2026-0007'));
    expect(cellaNumero, 'la cella vera del numero non esiste').toBeTruthy();
    expect(cellaNumero?.getAttribute('aria-hidden')).toBeNull();
  });

  it('senza sede, senza DDT e senza rimborso la cella dice «—», non resta vuota', async () => {
    await renderElenco([{ ...VENDITA, locationName: null, ddtReference: null }]);

    // Tre celle: Sede, DDT, Rimborso.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it("l'intestazione non è ordinabile finché l'API non sa ordinare", async () => {
    await renderElenco();

    const numero = screen.getByRole('columnheader', { name: /^Numero$/i });
    expect(numero.querySelector('button')).toBeNull();
  });
});
