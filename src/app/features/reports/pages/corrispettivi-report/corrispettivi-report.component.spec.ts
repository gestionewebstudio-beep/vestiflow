import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';

import type { CorrispettiviSummary } from '../../models/corrispettivi.model';
import { CorrispettiviService } from '../../services/corrispettivi.service';
import { CorrispettiviReportComponent } from './corrispettivi-report.component';

/**
 * Guardia sulla CTA doppia.
 *
 * La card «Periodo corrispettivi» è condivisa con altre due schermate, dove il
 * suo pulsante interno è l'unico modo di esportare ed è quindi acceso per
 * default. Qui no: l'export per il commercialista sta già in testata, e quel
 * pulsante — primary, senza `variant` — dava due CTA primarie nella stessa
 * vista (regole-stile-ui §5) per un'azione sola.
 *
 * Il test verifica ENTRAMBI i lati, perché spegnere il doppione senza lasciare
 * un modo di esportare sarebbe il difetto opposto: la testata deve continuare a
 * offrire CSV, foglio, PDF e anteprima di stampa.
 */

/** Titolare: `hasFullTenantAccess` gli concede l'export senza permessi espliciti. */
function titolare(): User {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'titolare@example.com',
    displayName: 'Titolare',
    avatarUrl: null,
    role: UserRole.Owner,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Shopify,
    tenantName: 'Cliente test',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    permissions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const zero = { amountMinor: 0, currencyCode: 'EUR' };

const riepilogoVuoto: CorrispettiviSummary = {
  orderCount: 0,
  undatedFulfilmentCount: 0,
  refundsCount: 0,
  subtotal: zero,
  tax: zero,
  shipping: zero,
  discount: zero,
  total: zero,
  taxable: zero,
  refundCount: 0,
  refundTotal: zero,
  refundTax: zero,
  cancellationCount: 0,
  cancellationTotal: zero,
  netTotal: zero,
  netTax: zero,
  netTaxable: zero,
};

async function apri(): Promise<void> {
  await render(CorrispettiviReportComponent, {
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: of(convertToParamMap({})) },
      },
      {
        provide: AuthService,
        useValue: { currentUser: () => titolare() },
      },
      {
        provide: CorrispettiviService,
        useValue: {
          listOrders: () =>
            of({ data: [], meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 } }),
          getSummary: () => of(riepilogoVuoto),
        },
      },
      {
        provide: BackgroundBlobExportService,
        useValue: { isActive: () => false, start: vi.fn() },
      },
    ],
  });
}

describe('CorrispettiviReportComponent — una sola CTA di export', () => {
  it('non ripete l’export dentro la card del periodo', async () => {
    await apri();

    expect(screen.queryByRole('button', { name: /esporta csv periodo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /esporta corrispettivi/i })).toBeNull();
  });

  it('lascia in testata tutte le azioni che il pulsante spento copriva', async () => {
    await apri();

    expect(screen.getByRole('button', { name: /export per commercialista/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /export excel/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /scarica pdf/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /anteprima stampa/i })).toBeTruthy();
  });
});
