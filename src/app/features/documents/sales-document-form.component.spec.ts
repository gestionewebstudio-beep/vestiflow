import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@core/auth';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DocumentType } from '@core/models/document.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import { UserRole } from '@core/models/user.model';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { ToastService } from '@core/services/toast.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { CustomerService } from '@domain/customers/services/customer.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';
import { ProductService } from '@domain/products/services/product.service';
import { SalesOrderService } from '@domain/sales-orders/services/sales-order.service';
import { TenantCompanyService } from '@domain/tenant/services/tenant-company.service';
import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';

import { SalesDocumentFormComponent } from './sales-document-form.component';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { APP_CONFIG } from '@core/config/app-config.token';

function operationalLocationsMock(defaultLocation: { id: string; name: string } | null = null) {
  const locations = [{ id: 'loc-1', name: 'Milano' }];
  return {
    locations: () => locations,
    writeLocations: () => locations,
    actionLocations: () => locations,
    transferTargetLocations: () => locations,
    // Il campo Sede in testata (§1-bis) la legge da qui: senza predefinita
    // resta vuoto, che è lo scenario della maggior parte di questi test.
    defaultLocation: () => defaultLocation,
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
}

const CUSTOMERS = [
  {
    id: 'cus-1',
    firstName: 'Mario',
    lastName: 'Rossi',
    companyName: null,
    email: 'mario@rossi.it',
  },
];

/** Operatore non titolare: conta solo l'elenco permessi, mai il ruolo. */
function clerkWith(permissions: readonly TenantPermissionKey[]) {
  return { role: UserRole.Clerk, permissions: [...permissions] };
}

interface SetupOptions {
  readonly pricesIncludeVat?: boolean;
  /** Primo numero libero proposto dal contatore predefinito. */
  readonly proposedNumber?: number;
  /** Numero che il server assegna davvero (diverso = l'ha preso un altro). */
  readonly assignedNumber?: number;
  /**
   * Permessi dell'operatore collegato. Omesso vuol dire «nessun utente in
   * sessione»: è lo scenario dei test sui totali, dove i permessi non contano.
   */
  readonly permissions?: readonly TenantPermissionKey[];
}

describe('SalesDocumentFormComponent', () => {
  // jsdom non implementa <dialog>: senza questo, il dialogo di conferma del
  // salvataggio esplode con «showModal is not a function». È un limite
  // dell'ambiente di prova, non del componente.
  beforeAll(() => {
    const proto = globalThis.HTMLDialogElement?.prototype;
    if (proto && !proto.showModal) {
      proto.showModal = function showModal(this: HTMLDialogElement) {
        this.open = true;
      };
      proto.close = function close(this: HTMLDialogElement) {
        this.open = false;
      };
    }
  });

  async function setup(options: SetupOptions = {}) {
    const proposedNumber = options.proposedNumber ?? null;
    const counters =
      proposedNumber === null
        ? []
        : [
            {
              id: 'cnt-1',
              type: DocumentType.Proforma,
              series: null,
              locationId: null,
              locationName: null,
              isDefault: true,
              nextNumber: proposedNumber,
              documentCount: 0,
            },
          ];
    // Il corpo arriva tipizzato `unknown`: i test lo ispezionano da sé, e
    // dichiararlo qui legherebbe lo stub alla forma del body.
    const createDocument = vi.fn((_body: unknown) =>
      of({ id: 'doc-1', number: options.assignedNumber ?? proposedNumber ?? 1 }),
    );
    const toast = { showInfo: vi.fn(), showError: vi.fn() };

    await render(SalesDocumentFormComponent, {
      providers: [
        // Serve da quando le righe usano il sistema condiviso delle colonne:
        // TableColumnPreferenceService costruisce l'API delle preferenze, che
        // legge la configurazione dell'app.
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
          provide: DocumentCountersService,
          useValue: {
            available: () =>
              of({ counters, proposedCounterId: counters.length > 0 ? 'cnt-1' : null }),
          },
        },
        // Senza permessi dichiarati non c'è utente in sessione: niente permesso
        // costi (il selettore articolo non deve mostrare il costo) e niente
        // gestione numerazioni. Chi verifica i permessi passa il proprio elenco.
        {
          provide: AuthService,
          useValue: {
            currentUser: () => (options.permissions ? clerkWith(options.permissions) : null),
          },
        },
        // Catch-all: dopo il salvataggio la maschera naviga davvero al dettaglio.
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { salesDocumentType: DocumentType.Proforma },
              queryParamMap: convertToParamMap({}),
            },
            paramMap: of(convertToParamMap({})),
            data: of({ salesDocumentType: DocumentType.Proforma }),
          },
        },
        { provide: OperationalLocationsService, useValue: operationalLocationsMock() },
        {
          provide: LocationContextService,
          useValue: { activeLocationId: () => null, setActiveLocation: vi.fn() },
        },
        {
          provide: CustomerService,
          useValue: {
            getCustomers: () => of({ data: CUSTOMERS, page: 1, pageSize: 100, total: 1 }),
          },
        },
        { provide: ProductService, useValue: { searchVariantSummaries: () => of([]) } },
        // Iniettato per la generazione «Concludi ordine → Fattura accompagnatoria».
        { provide: SalesOrderService, useValue: { concludeManualPrefill: vi.fn() } },
        { provide: VatCodeService, useValue: { list: () => of([]) } },
        // Tipi documento della controparte: li chiede il blocco condiviso in
        // testata, che senza un HttpClient nel test non arriverebbe in fondo.
        { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
        { provide: TenantFeatureSettingsService, useValue: { getSettings: () => of(null) } },
        // Dati cedente: alimentano l'IBAN precompilato in fattura.
        { provide: TenantCompanyService, useValue: { getCompany: () => of(null) } },
        { provide: ToastService, useValue: toast },
        {
          provide: DocumentService,
          useValue: {
            getDocumentById: vi.fn(),
            // Controllo cronologico (§4): serie in ordine, nessun avviso.
            checkChronology: () => of({ conflicts: [], dismissed: false }),
            dismissChronologyWarning: () => of(void 0),
            // DDT agganciabili in fattura (mai richiesti senza cliente).
            getDocuments: () => of({ data: [], page: 1, pageSize: 50, total: 0 }),
            createDocument,
            updateDocument: vi.fn(),
            confirmDocument: vi.fn(),
            getPriceModePreference: () => of(options.pricesIncludeVat ?? false),
          },
        },
      ],
    });

    return { createDocument, toast };
  }

  /** Cliente + una riga valida: il minimo che il salvataggio pretende. */
  async function fillMinimumDocument(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    // Testata desktop e pannello mobile convivono nel DOM: si usa la prima.
    await user.click(screen.getAllByRole('button', { name: 'Cliente' })[0]!);
    await user.click(screen.getByRole('option', { name: 'Mario Rossi' }));
    // Da 12/08/2026 la riga ha la cella nome CONDIVISA («Nome prodotto») al
    // posto della vecchia coppia tendina + colonna Descrizione.
    await user.type(screen.getAllByLabelText('Nome prodotto')[0]!, 'Maglietta');
  }

  /**
   * Salva: bottone in barra azioni + conferma nel dialogo. Da 08/2026 il
   * bottone si chiama «Salva documento» (un nome solo per lo stesso gesto su
   * tutte le maschere); la conferma nel dialogo resta «Salva».
   */
  async function save(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getAllByRole('button', { name: 'Salva documento' })[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }));
  }

  // Regressione: i totali stimati sono un computed che legge valori dai
  // FormControl (non signal). Devono aggiornarsi digitando il prezzo di riga,
  // non restare congelati sul valore iniziale (€ 0,00).
  it('aggiorna il totale stimato quando cambia il prezzo di riga', async () => {
    const user = userEvent.setup();
    await setup();

    expect(screen.queryByText(/12,20/)).toBeNull();

    const priceInput = screen.getByLabelText('Prezzo netto');
    await user.clear(priceInput);
    await user.type(priceInput, '10,00');

    // qty 1 × 10,00 con IVA 22% = imponibile 10,00 + IVA 2,20 = 12,20.
    expect(await screen.findByText(/12,20/)).toBeVisible();
  });

  // §sei decimali: 123,97 al 22% non ha un netto intero. Con l'imposta calcolata
  // sull'imponibile arrotondato il documento valeva 123,96 — un centesimo meno
  // di quello che l'operatore aveva digitato, e diverso da quello che il campo
  // prezzo continuava a mostrargli.
  it('il totale torna al prezzo ivato digitato, coda decimale compresa', async () => {
    const user = userEvent.setup();
    await setup({ pricesIncludeVat: true });

    const priceInput = screen.getByLabelText('Prezzo ivato');
    await user.clear(priceInput);
    await user.type(priceInput, '123,97');

    // Imponibile 101,61 + IVA 22,36 = 123,97, esattamente il prezzo digitato.
    expect(await screen.findByText(/101,61/)).toBeVisible();
    expect(screen.getAllByText(/123,97/).length).toBeGreaterThan(0);
  });

  // In modalità ivata cambia solo come si legge il prezzo: il documento vale
  // lo stesso, perché imponibile e imposta si ricavano dal netto scorporato.
  it('in modalità ivata i totali si calcolano dal netto scorporato', async () => {
    const user = userEvent.setup();
    await setup({ pricesIncludeVat: true });

    const priceInput = screen.getByLabelText('Prezzo ivato');
    await user.clear(priceInput);
    await user.type(priceInput, '12,20');

    // 12,20 ivati al 22% → imponibile 10,00, IVA 2,20, totale 12,20.
    expect(await screen.findByText(/10,00/)).toBeVisible();
    expect(screen.getAllByText(/12,20/).length).toBeGreaterThan(0);
  });

  // ── Numero proposto vs numero imposto ─────────────────────────────────────
  //
  // Il numero in testata è il primo libero: mostrarlo aiuta, rimandarlo al
  // server no. Se torna indietro diventa una scelta, e il secondo operatore si
  // becca un conflitto per un numero che gli aveva proposto la maschera.
  it('non manda il numero quando è la proposta e nessuno l’ha toccato', async () => {
    const user = userEvent.setup();
    const { createDocument, toast } = await setup({ proposedNumber: 42 });

    // La proposta arriva in afterNextRender: si attende che compaia.
    expect(await screen.findAllByDisplayValue('42')).not.toHaveLength(0);
    // Il campo dichiara che è una proposta, non un numero già acquisito.
    expect(screen.getAllByText('Primo libero: lo prende chi salva per primo.')).not.toHaveLength(0);

    await fillMinimumDocument(user);
    await save(user);

    expect(createDocument).toHaveBeenCalledTimes(1);
    const body = createDocument.mock.calls[0]![0] as { readonly number?: number };
    expect(body.number).toBeUndefined();
    // Numero assegnato uguale a quello mostrato: niente da segnalare.
    expect(toast.showInfo).not.toHaveBeenCalled();
  });

  // L'altra metà della regola: un numero scritto a mano (riempire un buco nella
  // numerazione) resta un'imposizione e viaggia col documento.
  it('manda il numero quando l’operatore lo digita', async () => {
    const user = userEvent.setup();
    const { createDocument } = await setup({ proposedNumber: 42, assignedNumber: 7 });

    await screen.findAllByDisplayValue('42');
    const numberInput = screen.getAllByLabelText<HTMLInputElement>('Numero')[0]!;
    await user.clear(numberInput);
    await user.type(numberInput, '7');

    // Toccato il numero, l'avviso di proposta sparisce: ora è una scelta.
    expect(screen.queryAllByText('Primo libero: lo prende chi salva per primo.')).toHaveLength(0);

    await fillMinimumDocument(user);
    await save(user);

    const body = createDocument.mock.calls[0]![0] as { readonly number?: number };
    expect(body.number).toBe(7);
  });

  // Concorrenza: il server ha assegnato il primo libero e non è più quello che
  // l'operatore aveva davanti. Dirglielo, o trascriverà il numero sbagliato.
  it('avvisa quando il numero assegnato è diverso da quello proposto', async () => {
    const user = userEvent.setup();
    const { toast } = await setup({ proposedNumber: 42, assignedNumber: 46 });

    // Il 42 dev'essere già a schermo: è il numero con cui si fa il confronto.
    await screen.findAllByDisplayValue('42');
    await fillMinimumDocument(user);
    await save(user);

    expect(toast.showInfo).toHaveBeenCalledWith(
      'Salvato con il n. 46: il 42 è stato preso da un altro operatore.',
    );
  });

  // ── Chi può gestire le numerazioni ────────────────────────────────────────

  // Senza «documents.configure» l'ingranaggio accanto alla serie non compare:
  // l'API nega la scrittura delle numerazioni, il comando risponderebbe 403.
  it('nasconde «Gestisci numerazioni» a chi non configura i documenti', async () => {
    await setup({ permissions: [] });

    expect(screen.queryByRole('button', { name: 'Gestisci numerazioni' })).toBeNull();
  });

  it('mostra «Gestisci numerazioni» a chi ha documents.configure', async () => {
    await setup({ permissions: [TenantPermission.DocumentsConfigure] });

    // Testata mobile e griglia desktop montano entrambe il campo.
    expect(screen.getAllByRole('button', { name: 'Gestisci numerazioni' }).length).toBeGreaterThan(
      0,
    );
  });
});
