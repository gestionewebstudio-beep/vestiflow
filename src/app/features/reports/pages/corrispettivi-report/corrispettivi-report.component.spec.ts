import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
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
    manualUnloadEnabled: true,
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
  perGiornata: [],
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
  locationUndeterminedExcludedCount: 0,
};

async function apri(
  summary: CorrispettiviSummary = riepilogoVuoto,
  user: User = titolare(),
): Promise<void> {
  await render(CorrispettiviReportComponent, {
    providers: [
      // Il selettore Colonne passa da `TableColumnPreferenceService`, che salva le
      // preferenze via HTTP e quindi tira `APP_CONFIG`. Senza, il componente non si
      // costruisce affatto — e il test fallirebbe per una ragione che non c'entra.
      { provide: APP_CONFIG, useValue: { apiBaseUrl: '/api/v1' } },
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: of(convertToParamMap({})) },
      },
      {
        provide: AuthService,
        useValue: { currentUser: () => user },
      },
      {
        provide: CorrispettiviService,
        useValue: {
          listOrders: () =>
            of({ data: [], meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 } }),
          getSummary: () => of(summary),
          listLocations: () => of([{ id: 'loc-1', name: 'Negozio Centro' }]),
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

  /**
   * ⚠️ **La prova è cambiata il 30/08/2026, e la cosa che presidia no.**
   *
   * Le AZIONI restano le stesse quattro; cambia dove si trovano. PDF e CSV non
   * sono più due pulsanti in fila: sono **voci del menu «Esporta»** — decisione
   * del proprietario, «utilizziamo Esporta e lì mettiamo pdf, csv, xml se
   * serve». Stampa ed Excel restano comandi propri, perché non sono formati di
   * esportazione (`14` §5.2).
   */
  it('lascia raggiungibili tutte le azioni che il pulsante spento copriva', async () => {
    const user = userEvent.setup();
    await apri();

    expect(screen.getByRole('button', { name: /^Stampa$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Excel$/i })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Esporta$/i }));

    expect(screen.getByRole('menuitem', { name: /CSV/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /PDF/i })).toBeTruthy();
  });

  /**
   * Il posto lasciato libero dal doppione è quello della primary vera: «+
   * Aggiungi corrispettivo» (`docs/10` §12). Resta **una sola** primary nella
   * vista — le quattro azioni di export sono ghost e secondary.
   */
  it('la primary della pagina è «Aggiungi corrispettivo»', async () => {
    await apri();

    expect(screen.getByRole('button', { name: /aggiungi corrispettivo/i })).toBeTruthy();
  });
});

/**
 * ⚠️ Filtrando per sede le righe che una sede non ce l'hanno escono dal
 * risultato — a quella sede non sono attribuibili — ma **non spariscono in
 * silenzio**: un registro che perde righe appena si sceglie una sede mostrerebbe
 * un totale più basso del vero, che in un registro fiscale è il difetto peggiore
 * possibile (`docs/10` §12).
 */
describe('CorrispettiviReportComponent — sedi non determinate', () => {
  it('dichiara quante righe il filtro Sede ha lasciato fuori', async () => {
    await apri({ ...riepilogoVuoto, locationUndeterminedExcludedCount: 3 });

    expect(screen.getByText(/3 registrazioni con Location non determinata/i)).toBeTruthy();
  });

  it('senza righe escluse non dice niente: il numero misura ciò che il filtro toglie', async () => {
    await apri();

    expect(screen.queryByText(/Location non determinata/i)).toBeNull();
  });
});

/**
 * Il pulsante è ergonomia: il controllo vero sta sull'API, che risponde 403.
 * Ma mostrarlo a chi non può usarlo produce un errore dopo il lavoro, non prima.
 */
describe('CorrispettiviReportComponent — chi può registrare', () => {
  it('senza il permesso del registro fiscale la primary non compare', async () => {
    await apri(riepilogoVuoto, {
      ...titolare(),
      role: UserRole.Clerk,
      permissions: ['section.sales', 'section.reports', 'doc.online_sale.view'],
    });

    expect(screen.queryByRole('button', { name: /aggiungi corrispettivo/i })).toBeNull();
  });
});
