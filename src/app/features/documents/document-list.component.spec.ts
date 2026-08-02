import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { CustomerService } from '@domain/customers/services/customer.service';
import type { DocumentListProfile } from '@domain/documents/models/document-list-query.model';
import { DocumentService } from '@domain/documents/services/document.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { TableViewPreferenceApiService } from '@shared/table-columns/table-view-preference-api.service';

import { DocumentListComponent } from './document-list.component';
import { ExternalDocumentTypeService } from './services/external-document-type.service';

/**
 * Test di CARATTERIZZAZIONE.
 *
 * `document-list` è UN componente che serve NOVE tipi di elenco documento:
 * titolo, sottotitolo, placeholder di ricerca ed empty state sono derivati dal
 * profilo che arriva dai dati di rotta. Una regressione qui non rompe niente —
 * mostra l'etichetta di un altro tipo documento, e non se ne accorge nessuno
 * finché non lo segnala un cliente.
 *
 * Un test per profilo: TestBed non si lascia riconfigurare due volte nello
 * stesso `it`.
 */

/** Risposta paginata vuota nella forma reale dell'API. */
const paginato = () => ({
  data: [] as readonly never[],
  meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
});

const PROFILI_VENDITA = ['quote', 'proforma', 'sales-ddt', 'invoice'] as const;

const PROFILI: readonly DocumentListProfile[] = [
  'generic',
  'goods-receipt',
  ...PROFILI_VENDITA,
  'manual-unload',
  'purchase-invoice',
  'store-sale',
];

interface ProfileLabels {
  listProfile: () => string;
  pageTitle: () => string;
  pageSubtitle: () => string;
  searchPlaceholder: () => string;
  emptyStateTitle: () => string;
  emptyStateDescription: () => string;
  emptyStateIcon: () => string;
}

async function setup(profile: DocumentListProfile): Promise<ProfileLabels> {
  const data = { documentListProfile: profile };
  const view = await render(DocumentListComponent, {
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          data: of(data),
          snapshot: { data, queryParamMap: convertToParamMap({}) },
          queryParamMap: of(convertToParamMap({})),
        },
      },
      { provide: AuthService, useValue: { currentUser: () => null } },
      {
        provide: DocumentService,
        useValue: {
          getDocuments: () => of(paginato()),
          getOperators: () => of([]),
          deleteDocument: vi.fn(),
          exportPdf: vi.fn(),
        },
      },
      { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
      { provide: CustomerService, useValue: { getCustomers: () => of(paginato()) } },
      { provide: SupplierService, useValue: { getSuppliers: () => of([]) } },
      { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
      { provide: OperationalLocationsService, useValue: { locations: () => [] } },
      {
        provide: TableViewPreferenceApiService,
        useValue: { load: () => of(null), save: () => of(undefined) },
      },
    ],
  });

  return view.fixture.componentInstance as unknown as ProfileLabels;
}

describe('DocumentListComponent — caratterizzazione dei profili', () => {
  for (const profile of PROFILI) {
    describe(`profilo «${profile}»`, () => {
      it('arriva al componente dai dati di rotta', async () => {
        const component = await setup(profile);

        expect(component.listProfile()).toBe(profile);
      });

      it('non lascia etichette vuote', async () => {
        const component = await setup(profile);

        expect(component.pageTitle()).toBeTruthy();
        expect(component.pageSubtitle()).toBeTruthy();
        expect(component.searchPlaceholder()).toBeTruthy();
        expect(component.emptyStateTitle()).toBeTruthy();
        expect(component.emptyStateDescription()).toBeTruthy();
        expect(component.emptyStateIcon()).toBeTruthy();
      });
    });
  }

  it('il profilo generico è il fallback del registro documenti', async () => {
    const component = await setup('generic');

    expect(component.pageTitle()).toBe('Registro documenti');
    expect(component.emptyStateTitle()).toBe('Nessun documento');
    expect(component.emptyStateIcon()).toBe('pi-file');
  });

  it('l’arrivo merce ha etichette proprie, non quelle del registro', async () => {
    const component = await setup('goods-receipt');

    expect(component.pageTitle()).toBe('Arrivi merce');
    expect(component.emptyStateTitle()).toBe('Nessun arrivo merce');
    expect(component.searchPlaceholder()).toContain('fornitore');
  });

  for (const profile of PROFILI_VENDITA) {
    it(`«${profile}» non ricade sulle etichette generiche`, async () => {
      const component = await setup(profile);

      expect(component.pageTitle()).not.toBe('Registro documenti');
      expect(component.pageTitle()).not.toBe('Arrivi merce');
    });
  }
});
