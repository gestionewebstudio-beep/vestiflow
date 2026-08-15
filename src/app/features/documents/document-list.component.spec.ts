import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { UserRole } from '@core/models/user.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { CustomerService } from '@domain/customers/services/customer.service';
import type { DocumentListProfile } from '@domain/documents/models/document-list-query.model';
import { DocumentService } from '@domain/documents/services/document.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { TableViewPreferenceApiService } from '@shared/table-columns/table-view-preference-api.service';

import { DocumentListComponent, SECONDARY_CREATE_ENTRIES } from './document-list.component';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';

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

/** Utente della sessione: `null` = nessun permesso (default dei test di etichetta). */
interface UtenteDiProva {
  readonly role: string;
  readonly permissions: readonly string[];
}

async function renderList(profile: DocumentListProfile, user: UtenteDiProva | null = null) {
  const data = { documentListProfile: profile };
  return render(DocumentListComponent, {
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
      { provide: AuthService, useValue: { currentUser: () => user } },
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
}

async function setup(profile: DocumentListProfile): Promise<ProfileLabels> {
  const view = await renderList(profile);

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

/**
 * I comandi di creazione del registro generico valevano «gestisce almeno UNA
 * famiglia»: chi poteva fare solo preventivi vedeva comunque il carico e tutti
 * e nove i tipi del menu, che l'API adesso rifiuta con un 403.
 */
describe('DocumentListComponent — comandi di creazione e matrice permessi', () => {
  const SOLO_PREVENTIVI: UtenteDiProva = {
    role: UserRole.Clerk,
    permissions: ['section.documents', 'doc.quote.manage'],
  };

  /** Voci offerte dal menu «Altro documento», per etichetta. */
  function tipiOfferti(view: { fixture: { componentInstance: unknown } }): readonly string[] {
    const component = view.fixture.componentInstance as {
      secondaryCreateOptions: () => readonly { readonly label: string }[];
    };
    return component.secondaryCreateOptions().map((option) => option.label);
  }

  it('non offre «Nuovo arrivo merce» a chi non gestisce i carichi', async () => {
    await renderList('generic', SOLO_PREVENTIVI);

    expect(screen.queryByRole('button', { name: /Nuovo arrivo merce/i })).toBeNull();
  });

  it('nel menu «Altro documento» lascia solo i tipi gestibili', async () => {
    const view = await renderList('generic', SOLO_PREVENTIVI);

    expect(tipiOfferti(view)).toEqual(['Preventivo']);
  });

  it('senza famiglie gestibili la testata non offre alcuna creazione', async () => {
    await renderList('generic', {
      role: UserRole.Clerk,
      permissions: ['section.documents', 'doc.goods_receipt.view'],
    });

    expect(screen.queryByRole('button', { name: /Nuovo arrivo merce/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Crea altro tipo di documento/i })).toBeNull();
  });

  it('al titolare resta tutto il menu', async () => {
    const view = await renderList('generic', { role: UserRole.Owner, permissions: [] });

    // Il confronto è con l'elenco dichiarato, non con un numero: `toHaveLength(9)`
    // andava aggiornato a mano a ogni voce nuova, e diceva «sono nove» invece di
    // «non ne manca nessuna» — che è la regola vera per chi ha tutti i permessi.
    expect(tipiOfferti(view)).toEqual(SECONDARY_CREATE_ENTRIES.map((entry) => entry.label));
    expect(screen.queryByRole('button', { name: /Crea altro tipo di documento/i })).not.toBeNull();
  });
});
