import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import { ReportPeriodPreset } from '@domain/reports/models/report-list-query.model';

import type {
  CorrispettiviListQuery,
  CorrispettiviSummary,
} from '../../models/corrispettivi.model';
import { CorrispettiviService } from '../../services/corrispettivi.service';
import { CorrispettiviReportComponent } from '../corrispettivi-report/corrispettivi-report.component';
import { CorrispettiviPrintComponent } from './corrispettivi-print.component';

/**
 * ⚠️ **La stampa deve rispondere alla STESSA domanda della schermata.**
 *
 * Fino al 17/08/2026 non lo faceva: la schermata passava `ambito`, `canale`,
 * `rowType` e `locationId` nell'indirizzo dell'anteprima, e l'anteprima leggeva
 * il solo periodo — più un `onlineOnly` che nessuno mandava più e che l'API non
 * conosce (misurato: una sola occorrenza viva in tutto il repository, e
 * `buildParams` non lo scriveva nemmeno nella richiesta).
 *
 * Chi guardava «2° trimestre · Fisico/POS · Resi» stampava **tutto il
 * trimestre**, e il foglio sembrava giusto. Su un registro che va al
 * commercialista è il difetto peggiore: nessuno ricontrolla un totale
 * plausibile.
 *
 * Questi test non guardano una stringa: mettono le DUE schermate davanti agli
 * STESSI parametri e confrontano la domanda che ognuna fa all'API.
 */

const zero = { amountMinor: 0, currencyCode: 'EUR' };

const riepilogo: CorrispettiviSummary = {
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

/** «2° trimestre 2026 · Fisico/POS · VestiFlow · Resi · Magazzino Nord». */
const FILTRI_EFFETTIVI = {
  period: ReportPeriodPreset.CalendarQuarter,
  year: '2026',
  quarter: '2',
  ambito: 'fisico_pos',
  canale: 'vestiflow',
  rowType: 'returns',
  locationId: 'loc-nord',
};

/** I soli campi che decidono QUALI righe: pagina e conteggio non c'entrano. */
function domandaAllApi(query: CorrispettiviListQuery) {
  return {
    placedFrom: query.placedFrom,
    placedTo: query.placedTo,
    ambito: query.ambito,
    canale: query.canale,
    rowType: query.rowType,
    locationId: query.locationId,
  };
}

function serviceSpia() {
  const listOrders = vi.fn((_query: CorrispettiviListQuery) =>
    of({ data: [], meta: { page: 1, pageSize: 500, total: 0, totalPages: 0 } }),
  );
  const exportPdf = vi.fn((_query: CorrispettiviListQuery) => of(new Blob()));
  return {
    listOrders,
    getSummary: () => of(riepilogo),
    listLocations: () => of([{ id: 'loc-nord', name: 'Magazzino Nord' }]),
    exportPdf,
    exportAccountantCsv: () => of(new Blob()),
    exportSpreadsheet: () => of(new Blob()),
  };
}

async function apri<T>(
  componente: Type<T>,
  params: Record<string, string>,
  service = serviceSpia(),
) {
  await render(componente, {
    providers: [
      // Il selettore Colonne passa da `TableColumnPreferenceService`, che salva le
      // preferenze via HTTP e quindi tira `APP_CONFIG`. Senza, il componente non si
      // costruisce affatto — e il test fallirebbe per una ragione che non c'entra.
      { provide: APP_CONFIG, useValue: { apiBaseUrl: '/api/v1' } },
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: of(convertToParamMap(params)) },
      },
      { provide: AuthService, useValue: { currentUser: () => titolare() } },
      { provide: CorrispettiviService, useValue: service },
      {
        provide: BackgroundBlobExportService,
        useValue: {
          isActive: () => false,
          // Esegue subito la richiesta invece di metterla in coda: al test
          // interessa CON QUALI filtri parte, non il meccanismo di download.
          start: (opzioni: { request: { subscribe: (fn: () => void) => void } }) =>
            opzioni.request.subscribe(() => undefined),
        },
      },
    ],
  });
  return service;
}

describe('Anteprima stampa — gli stessi filtri del Registro', () => {
  beforeEach(() => {
    // Il componente stampa chiama `print()` appena i dati arrivano: in jsdom non
    // esiste e farebbe fallire il test per una ragione che non c'entra.
    vi.stubGlobal('print', vi.fn());
  });

  it('legge ambito, canale, tipo e sede — non il solo periodo', async () => {
    const service = await apri(CorrispettiviPrintComponent, FILTRI_EFFETTIVI);

    expect(domandaAllApi(service.listOrders.mock.calls[0]![0])).toEqual({
      placedFrom: '2026-04-01',
      placedTo: '2026-06-30',
      ambito: 'fisico_pos',
      canale: 'vestiflow',
      rowType: 'returns',
      locationId: 'loc-nord',
    });
  });

  it('non manda più `onlineOnly`: l’API non lo conosce e non lo conosceva', async () => {
    const service = await apri(CorrispettiviPrintComponent, FILTRI_EFFETTIVI);

    expect(service.listOrders.mock.calls[0]![0]).not.toHaveProperty('onlineOnly');
  });

  it('Fisico/POS + Resi + Sede: la stampa chiede ESATTAMENTE ciò che chiede il Registro', async () => {
    const stampa = await apri(CorrispettiviPrintComponent, FILTRI_EFFETTIVI);
    const domandaStampa = domandaAllApi(stampa.listOrders.mock.calls[0]![0]);

    // Un solo `render` per modulo di test: il TestBed si configura una volta e
    // basta. Si azzera fra i due, o il secondo `render` esplode con «test module
    // already instantiated» — che non è il difetto che si sta cercando.
    TestBed.resetTestingModule();

    const registro = await apri(CorrispettiviReportComponent, FILTRI_EFFETTIVI);
    const domandaRegistro = domandaAllApi(registro.listOrders.mock.calls[0]![0]);

    // Il confronto è fra le due domande, non fra una domanda e una costante
    // scritta a mano: una costante si aggiorna insieme al difetto, l'altra no.
    expect(domandaStampa).toEqual(domandaRegistro);
  });
});

describe('Scarica PDF — gli stessi filtri del Registro', () => {
  it('il PDF parte con i filtri effettivi, sede compresa', async () => {
    const service = await apri(CorrispettiviReportComponent, FILTRI_EFFETTIVI);
    screen.getByRole('button', { name: /^PDF$/i }).click();

    expect(domandaAllApi(service.exportPdf.mock.calls[0]![0])).toEqual(
      domandaAllApi(service.listOrders.mock.calls[0]![0]),
    );
  });
});
