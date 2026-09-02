import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@core/auth';
import { render, screen, within, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

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
import type { TenantFeatureSettings } from '@domain/tenant/models/tenant-feature-settings.model';
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
  /** Catalogo articoli: la ricerca per nome e quella per id lo rispettano. */
  readonly variantSummaries?: readonly Record<string, unknown>[];
  /** Codici IVA disponibili: servono alla catena di precedenza della riga. */
  readonly vatCodes?: readonly Record<string, unknown>[];
  /**
   * Documento già salvato: la maschera si apre **in modifica** (id nella rotta,
   * documento restituito dalla GET) e il salvataggio va in PATCH invece che in
   * POST. Senza, questa spec sapeva provare solo la creazione — ed è il motivo
   * per cui il difetto del corpo di PATCH è arrivato fino a schermo.
   */
  readonly editDocument?: Record<string, unknown>;
  /**
   * Tipo dichiarato dalla ROTTA. Predefinito Proforma, che è quello che i test
   * storici assumevano. Da valorizzare quando conta chi decide il tipo: la
   * rotta o il documento caricato (`07-…§18`).
   */
  readonly routeType?: DocumentType;
  /**
   * La GET del documento non risponde mai: serve a osservare la maschera nella
   * finestra in cui il documento non è ancora arrivato — la finestra in cui il
   * difetto del ripiego a Proforma si vedeva.
   */
  readonly documentNeverLoads?: boolean;
  /**
   * Impostazioni del tenant. Servono al selettore **Listino**, che compare solo
   * quando c'è più di una sorgente prezzo fra cui scegliere.
   */
  readonly tenantSettings?: TenantFeatureSettings | null;
}

/**
 * L'importo di una voce del riepilogo, cercata per etichetta.
 *
 * ⚠️ Dal 24/08/2026 questa maschera mostra «Imponibile righe» (pre-sconto) e
 * «Imponibile» (scontato) come le altre quattro. Senza sconto valgono lo stesso
 * numero, quindi `findByText(/101,61/)` ne trova DUE: l'asserzione deve dire
 * di quale voce parla.
 */
function importoDellaVoce(etichetta: string): string {
  // Interroga il documento come fa `screen`: `setup()` non espone il container.
  const riga = [...globalThis.document.querySelectorAll('.doc-form__totals-row')].find(
    (r) => r.querySelector('dt')?.textContent?.replace(/\s+/g, ' ').trim() === etichetta,
  );
  return riga?.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('SalesDocumentFormComponent', () => {
  // ⛔ Qui c'era il polyfill di `<dialog>` per jsdom, copiato in TRE spec.
  // Portato in `src/test-setup.ts` il 25/08/2026: una copia mancante non si
  // vede — la prova che apre il dialogo semplicemente non esiste ancora.

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
    const updateDocument = vi.fn((_id: string, _body: unknown) =>
      of({ id: 'doc-1', number: options.assignedNumber ?? proposedNumber ?? 1 }),
    );
    const editParams = options.editDocument || options.documentNeverLoads ? { id: 'doc-1' } : {};
    const routeType = options.routeType ?? DocumentType.Proforma;

    const view = await render(SalesDocumentFormComponent, {
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
              data: { salesDocumentType: routeType },
              queryParamMap: convertToParamMap({}),
            },
            paramMap: of(convertToParamMap(editParams)),
            data: of({ salesDocumentType: routeType }),
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
        {
          provide: ProductService,
          useValue: {
            // Il filtro per `variantId` va rispettato come nel servizio vero:
            // un catalogo che risponde sempre con tutto farebbe agganciare il
            // primo articolo qualunque cosa si chieda.
            searchVariantSummaries: (params?: { readonly variantId?: string }) => {
              const catalogo = options.variantSummaries ?? [];
              return of(
                params?.variantId
                  ? catalogo.filter((row) => row['variantId'] === params.variantId)
                  : catalogo,
              );
            },
          },
        },
        // Iniettato per la generazione «Concludi ordine → Fattura accompagnatoria».
        { provide: SalesOrderService, useValue: { concludeManualPrefill: vi.fn() } },
        { provide: VatCodeService, useValue: { list: () => of(options.vatCodes ?? []) } },
        // Tipi documento della controparte: li chiede il blocco condiviso in
        // testata, che senza un HttpClient nel test non arriverebbe in fondo.
        { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
        {
          provide: TenantFeatureSettingsService,
          useValue: { getSettings: () => of(options.tenantSettings ?? null) },
        },
        // Dati cedente: alimentano l'IBAN precompilato in fattura.
        { provide: TenantCompanyService, useValue: { getCompany: () => of(null) } },
        { provide: ToastService, useValue: toast },
        {
          provide: DocumentService,
          useValue: {
            // `documentNeverLoads`: un Observable che non emette mai, così la
            // maschera resta nella finestra «id nella rotta, documento non
            // ancora arrivato» — dove il tipo può venire solo dalla rotta.
            getDocumentById: vi.fn(() =>
              options.documentNeverLoads ? NEVER : of(options.editDocument ?? null),
            ),
            updateDocument,
            // Controllo cronologico (§4): serie in ordine, nessun avviso.
            checkChronology: () => of({ conflicts: [], dismissed: false }),
            dismissChronologyWarning: () => of(void 0),
            // DDT agganciabili in fattura (mai richiesti senza cliente).
            getDocuments: () => of({ data: [], page: 1, pageSize: 50, total: 0 }),
            createDocument,
            confirmDocument: vi.fn(),
            getPriceModePreference: () => of(options.pricesIncludeVat ?? false),
          },
        },
      ],
    });

    return { createDocument, updateDocument, toast, component: view.fixture.componentInstance };
  }

  /**
   * Cliente e sede: la testata che le righe pretendono per mostrarsi.
   *
   * Dal 02/09/2026 le righe non esistono finché la testata è incompleta (§7,
   * «A testata incompleta le righe non si mostrano»): al loro posto c'è uno
   * stato vuoto. Un test che cerca un campo di riga senza passare di qui non
   * trova niente — ed è il comportamento voluto, non un guasto del test.
   */
  async function apriRighe(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole('button', { name: 'Cliente' }));
    await user.click(screen.getByRole('option', { name: 'Mario Rossi' }));
    await user.click(screen.getByRole('button', { name: 'Sede' }));
    await user.click(screen.getByRole('option', { name: 'Milano' }));
  }

  /** Cliente + sede + una riga valida: il minimo che il salvataggio pretende. */
  async function fillMinimumDocument(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    // ⛔ Qui si prendeva «la prima» delle due copie, perché «testata desktop e
    // pannello mobile convivono nel DOM». La testata ora si dichiara una volta
    // e le due vesti sono esclusive: la copia è una, e `getByRole` fallisce se
    // la doppia scrittura torna.
    await apriRighe(user);
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

  // ── Testata incompleta: le righe non ci sono ──────────────────────────────
  //
  // §7, «A testata incompleta le righe non si mostrano»: finché mancano i campi
  // che le governano — qui cliente e sede — al posto della tabella c'è uno stato
  // vuoto che dice COSA manca. Non si spegne e non si sbiadisce: non c'è.
  //
  // Vale su tutti e quattro i tipi di questa maschera (Proforma, Fattura,
  // Fattura accompagnatoria, Nota di credito), che condividono la testata.
  it('nasconde le righe finché cliente e sede non sono scelti', async () => {
    const user = userEvent.setup();
    await setup();

    // Lo stato vuoto NOMINA i due campi che tengono ferme le righe: un titolo
    // generico costringerebbe a cercarli a occhio nella testata.
    expect(screen.getByText('Scegli il cliente e la sede')).toBeVisible();
    expect(screen.queryByLabelText('Prezzo riga 1')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Cliente' }));
    await user.click(screen.getByRole('option', { name: 'Mario Rossi' }));

    // Un campo solo non basta: lo stato vuoto resta e nomina quello che manca.
    expect(screen.queryByLabelText('Prezzo riga 1')).toBeNull();
    expect(screen.getByText('Scegli la sede')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Sede' }));
    await user.click(screen.getByRole('option', { name: 'Milano' }));

    expect(screen.getByLabelText('Prezzo riga 1')).toBeVisible();
    expect(screen.queryByText(/Scegli il cliente|Scegli la sede/)).toBeNull();
  });

  // Regressione: i totali stimati sono un computed che legge valori dai
  // FormControl (non signal). Devono aggiornarsi digitando il prezzo di riga,
  // non restare congelati sul valore iniziale (€ 0,00).
  it('aggiorna il totale stimato quando cambia il prezzo di riga', async () => {
    const user = userEvent.setup();
    await setup();
    await apriRighe(user);

    expect(screen.queryByText(/12,20/)).toBeNull();

    // ⚠️ L'etichetta e' quella della RIGA COMUNE e dice QUALE riga: quella
    // locale ripeteva «Prezzo netto»/«Prezzo ivato» su ogni riga, e a voce non
    // le distingueva. Prevale l'Ordine cliente (decisione del 24/08/2026).
    const priceInput = screen.getByLabelText('Prezzo riga 1');
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
    await apriRighe(user);

    const priceInput = screen.getByLabelText('Prezzo riga 1');
    await user.clear(priceInput);
    await user.type(priceInput, '123,97');
    await screen.findByText(/123,97/);

    // Imponibile 101,61 + IVA 22,36 = 123,97, esattamente il prezzo digitato.
    // ⚠️ Per VOCE, non per testo: senza sconto «Imponibile righe» e
    // «Imponibile» valgono lo stesso numero, come sulle altre quattro maschere.
    expect(importoDellaVoce('Imponibile')).toContain('101,61');
    expect(importoDellaVoce('Totale documento')).toContain('123,97');
  });

  // In modalità ivata cambia solo come si legge il prezzo: il documento vale
  // lo stesso, perché imponibile e imposta si ricavano dal netto scorporato.
  it('in modalità ivata i totali si calcolano dal netto scorporato', async () => {
    const user = userEvent.setup();
    await setup({ pricesIncludeVat: true });
    await apriRighe(user);

    const priceInput = screen.getByLabelText('Prezzo riga 1');
    await user.clear(priceInput);
    await user.type(priceInput, '12,20');
    await screen.findByText(/12,20/);

    // 12,20 ivati al 22% → imponibile 10,00, IVA 2,20, totale 12,20.
    expect(importoDellaVoce('Imponibile')).toContain('10,00');
    expect(importoDellaVoce('IVA')).toContain('2,20');
    expect(importoDellaVoce('Totale documento')).toContain('12,20');
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
    expect(await screen.findAllByDisplayValue('42')).toHaveLength(1);
    // Il campo dichiara che è una proposta, non un numero già acquisito.
    // ⛔ Qui si asseriva solo «almeno una»: con la testata scritta due volte le
    // occorrenze erano due, e il conteggio esatto avrebbe dato fastidio. Ora è
    // una, ed è la guardia che tiene ferma la scrittura unica.
    expect(screen.getAllByText('Primo libero: lo prende chi salva per primo.')).toHaveLength(1);

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
    const numberInput = screen.getByLabelText<HTMLInputElement>('Numero');
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

    // ⛔ Qui si contava «più di zero», perché testata mobile e griglia desktop
    // montavano entrambe il campo. Ne esiste una sola.
    expect(screen.getByRole('button', { name: 'Gestisci numerazioni' })).toBeVisible();
  });

  // ── Il corpo del PATCH ────────────────────────────────────────────────────
  //
  // Difetto reale, arrivato fino a schermo il 15/08/2026: la maschera spediva
  // in modifica lo stesso corpo della creazione, `type` e `sourceDocumentId`
  // compresi. Il DTO di aggiornamento non li prevede e l'API valida con
  // `forbidNonWhitelisted` → 400, senza messaggio: il pulsante sembrava inerte.
  // Modificare un documento da questa maschera non aveva mai funzionato.
  //
  // La prova sta qui e non fra i test di creazione perché è la MODIFICA che era
  // scoperta: questa spec sapeva montare solo la maschera nuova.
  it('in modifica non manda type né sourceDocumentId', async () => {
    const user = userEvent.setup();
    const { updateDocument, createDocument } = await setup({
      editDocument: {
        id: 'doc-1',
        type: DocumentType.Proforma,
        status: 'draft',
        series: 'A',
        year: 2026,
        number: 7,
        reference: 'PRO-0007',
        documentDate: '2026-08-15T00:00:00.000Z',
        currency: 'EUR',
        customerId: 'cus-1',
        locationId: 'loc-1',
        pricesIncludeVat: false,
        documentDiscountPercent: 0,
        lines: [
          {
            id: 'l-1',
            lineNumber: 1,
            description: 'Maglietta',
            quantity: 2,
            unitPrice: { amountMinor: 1000, currencyCode: 'EUR' },
            discountPercent: 0,
            loadsStock: false,
          },
        ],
      },
    });

    await save(user);

    expect(createDocument).not.toHaveBeenCalled();
    expect(updateDocument).toHaveBeenCalledTimes(1);
    const [id, body] = updateDocument.mock.calls[0]! as [string, Record<string, unknown>];
    expect(id).toBe('doc-1');
    expect(body).not.toHaveProperty('type');
    expect(body).not.toHaveProperty('sourceDocumentId');
    // Il resto del corpo deve esserci: la correzione toglie due campi, non
    // dimezza il salvataggio.
    expect(body['customerId']).toBe('cus-1');
    expect(body['lines']).toHaveLength(1);
  });

  // La riga già salvata rimanda indietro il proprio id: è ciò che consente al
  // server di aggiornarla invece di ricrearla (docs/09 §4-bis).
  it('in modifica la riga rimanda indietro il proprio id', async () => {
    const user = userEvent.setup();
    const { updateDocument } = await setup({
      editDocument: {
        id: 'doc-1',
        type: DocumentType.Proforma,
        status: 'draft',
        series: 'A',
        year: 2026,
        number: 7,
        reference: 'PRO-0007',
        documentDate: '2026-08-15T00:00:00.000Z',
        currency: 'EUR',
        customerId: 'cus-1',
        locationId: 'loc-1',
        pricesIncludeVat: false,
        documentDiscountPercent: 0,
        lines: [
          {
            id: 'l-1',
            lineNumber: 1,
            description: 'Maglietta',
            quantity: 2,
            unitPrice: { amountMinor: 1000, currencyCode: 'EUR' },
            discountPercent: 0,
            loadsStock: false,
          },
        ],
      },
    });

    await save(user);

    const [, body] = updateDocument.mock.calls[0]! as [string, { lines: { id?: string }[] }];
    expect(body.lines[0]!.id).toBe('l-1');
  });

  // ── Il nome dell'articolo: controllo `productName`, chiave `description` ──
  //
  // ⛔ Difetto misurato il 24/08/2026: il controllo si chiamava `description`
  // mentre la riga e la card comuni leggono `productName`. Dall'adozione della
  // riga condivisa il nome in cella arrivava VUOTO — si scriveva su un
  // controllo e se ne leggeva un altro — e la riga «Documento collegato», che
  // lega `formControlName="productName"`, non trovava proprio il controllo.
  //
  // ⚠️ La prova guarda i DUE lati, e non è pignoleria: verificare solo il nome
  // del controllo lascerebbe passare una mappatura che non rimanda più al
  // server la chiave del DTO, e il nome della riga si perderebbe al
  // salvataggio senza che niente diventi rosso.
  it('il nome sta su «productName», e al server torna come «description»', async () => {
    const user = userEvent.setup();
    const { updateDocument, component } = await setup({
      editDocument: {
        id: 'doc-1',
        type: DocumentType.Proforma,
        status: 'draft',
        series: 'A',
        year: 2026,
        number: 7,
        reference: 'PRO-0007',
        documentDate: '2026-08-15T00:00:00.000Z',
        currency: 'EUR',
        customerId: 'cus-1',
        locationId: 'loc-1',
        pricesIncludeVat: false,
        documentDiscountPercent: 0,
        lines: [
          {
            id: 'l-1',
            lineNumber: 1,
            description: 'Maglietta',
            quantity: 2,
            unitPrice: { amountMinor: 1000, currencyCode: 'EUR' },
            discountPercent: 0,
            loadsStock: false,
          },
        ],
      },
    });

    const righe = (
      component as unknown as {
        lines: { at: (i: number) => { controls: Record<string, { value: unknown }> } };
      }
    ).lines;
    expect(righe.at(0).controls['productName']!.value).toBe('Maglietta');
    expect(righe.at(0).controls['description']).toBeUndefined();

    await save(user);

    const [, body] = updateDocument.mock.calls[0]! as [
      string,
      { lines: { description?: string }[] },
    ];
    expect(body.lines[0]!.description).toBe('Maglietta');
  });

  // ── Sostituzione d'articolo sulla riga ────────────────────────────────────
  //
  // Qui il prezzo si riscriveva già; il **Codice IVA** no, e restava quello
  // dell'articolo precedente: un'aliquota sbagliata su un documento fiscale,
  // che nessuno vede perché la colonna mostra un codice, non un errore.
  it('sostituendo l’articolo, prezzo e Codice IVA seguono il nuovo', async () => {
    const { component } = await setup({
      // Fixture complete: la cella usa la mappatura condivisa, che legge anche
      // `code` (l'etichetta in cella) e `description` (il dettaglio nel menu).
      vatCodes: [
        {
          id: 'iva-22',
          code: '22',
          description: 'Imponibile 22%',
          ratePercent: 22,
          calculationMode: 'standard',
          isActive: true,
          usageScope: 'both',
        },
        {
          id: 'iva-10',
          code: '10',
          description: 'Imponibile 10%',
          ratePercent: 10,
          calculationMode: 'standard',
          isActive: true,
          usageScope: 'both',
        },
      ],
      variantSummaries: [
        {
          variantId: 'var-A',
          productId: 'p-A',
          sku: 'A-1',
          articleCode: '001',
          productName: 'Articolo A',
          title: 'Articolo A',
          sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
          defaultVatCodeId: 'iva-22',
          managesStock: true,
        },
        {
          variantId: 'var-B',
          productId: 'p-B',
          sku: 'B-1',
          articleCode: '002',
          productName: 'Articolo B',
          title: 'Articolo B',
          sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
          defaultVatCodeId: 'iva-10',
          managesStock: true,
        },
      ],
    });
    const form = component as unknown as {
      onVariantSelect: (index: number, variantId: string, known: unknown) => void;
      lines: { at: (i: number) => { controls: Record<string, { value: unknown }> } };
    };
    const catalogo = {
      A: {
        variantId: 'var-A',
        sku: 'A-1',
        articleCode: '001',
        productName: 'Articolo A',
        barcode: undefined,
        sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
        defaultVatCodeId: 'iva-22',
        managesStock: true,
      },
      B: {
        variantId: 'var-B',
        sku: 'B-1',
        articleCode: '002',
        productName: 'Articolo B',
        barcode: undefined,
        sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
        defaultVatCodeId: 'iva-10',
        managesStock: true,
      },
    };

    form.onVariantSelect(0, 'var-A', catalogo.A);
    expect(form.lines.at(0).controls['unitPrice']!.value).toBe('10,00');
    expect(form.lines.at(0).controls['vatCodeId']!.value).toBe('iva-22');

    form.onVariantSelect(0, 'var-B', catalogo.B);

    expect(form.lines.at(0).controls['unitPrice']!.value).toBe('25,00');
    expect(form.lines.at(0).controls['vatCodeId']!.value).toBe('iva-10');
  });

  /**
   * Il tipo del documento prima che il documento arrivi — regressione di `07-…§18`.
   *
   * Prima delle rotte per tipo, la modifica passava da `sales/:id/edit`, che il
   * tipo non lo portava: il form lo prendeva dal documento **caricato**, e nella
   * finestra fra l'apertura e la risposta della GET si comportava da proforma.
   * Non era un dettaglio invisibile: il titolo diceva «Modifica proforma» su una
   * fattura, e la nota precompilata ci scriveva «Documento non fiscale / Proforma
   * non valida ai fini IVA».
   *
   * Questi test misurano **quella finestra**: la GET non risponde mai, quindi
   * l'unica fonte possibile del tipo è la rotta.
   */
  describe('SalesDocumentFormComponent — il tipo viene dalla rotta, non dall attesa', () => {
    it('in modifica, prima che il documento arrivi, la fattura è già una fattura', async () => {
      await setup({
        routeType: DocumentType.Invoice,
        documentNeverLoads: true,
      });

      expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Modifica fattura');
      expect(screen.queryByText(/Proforma non valida ai fini IVA/)).toBeNull();
    });

    it('lo stesso vale per la nota di credito, che non è né fattura né proforma', async () => {
      await setup({
        routeType: DocumentType.CreditNote,
        documentNeverLoads: true,
      });

      expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
        'Modifica nota di credito',
      );
    });

    it('la proforma resta una proforma: la rotta dice il tipo anche quando è quello vecchio', async () => {
      await setup({
        routeType: DocumentType.Proforma,
        documentNeverLoads: true,
      });

      expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Modifica proforma');
    });
  });

  /**
   * Il selettore **Listino** non è il selettore netto/ivato — guardia del 16/08.
   *
   * Il 16/08 l'etichetta «Listino» è stata rinominata «Prezzo» credendo che
   * fosse il titolo del controllo netto/ivato che le sta accanto in testata
   * (commit `3d1afa37`, annullato). Sono due controlli diversi, e la premessa
   * su cui poggiava la rinomina — «i listini non li abbiamo mai usati» — era
   * falsa: i prezzi stanno in `products.listino1..3_price_minor` e tutti i
   * tenant hanno il primo listino acceso.
   *
   * Il test fissa la DISTINZIONE, non l'etichetta:
   * - **Listino** = quale sorgente prezzi alimenta le righe;
   * - **netto/ivato** = come si legge l'importo (sull'intestazione di colonna);
   * - **Prezzo** = il valore economico della riga.
   */
  describe('il selettore Listino non è il selettore netto/ivato', () => {
    const CON_DUE_LISTINI: TenantFeatureSettings = {
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
      listino3Name: 'Outlet',
      listino3Active: true,
    };

    it('si chiama «Listino», e non prende il nome del valore che governa', async () => {
      await setup({ tenantSettings: CON_DUE_LISTINI });

      // ⛔ Qui c'era scritto che «due occorrenze sono la norma in questa
      // maschera»: era la testata scritta due volte, diventata un requisito del
      // test. Il campo è uno.
      expect(screen.getByLabelText('Listino applicato alle righe')).toBeVisible();
      // Il nome accessibile non deve diventare «Prezzo…»: quella parola è già
      // della colonna degli importi, e chiamare così anche questo rende i due
      // controlli indistinguibili per chi usa un lettore di schermo.
      expect(screen.queryByLabelText('Prezzo applicato alle righe')).toBeNull();
    });

    it('offre le SORGENTI prezzo del tenant, non netto e ivato', async () => {
      const view = await setup({ tenantSettings: CON_DUE_LISTINI });
      const component = view.component as unknown as {
        listinoOptions: () => readonly { readonly label: string }[];
      };

      // Se un giorno queste diventassero «Netto»/«Ivato», qualcuno avrà fuso i
      // due controlli: sono le due cose che questa guardia tiene separate.
      expect(component.listinoOptions().map((o) => o.label)).toEqual([
        'Prezzo di vendita',
        'Ingrosso',
        'Outlet',
      ]);
    });

    /**
     * ⛔ **La tendina non offre la stessa voce due volte** — guardia del 24/08/2026.
     *
     * `select-menu` disegna una voce vuota etichettata col **segnaposto**
     * (`includeEmptyOption`, che vale `true` per difetto), e questa maschera
     * passava come segnaposto la stessa parola che è già la prima opzione vera:
     * «Prezzo di vendita». Il pannello mostrava due righe identiche, e la prima
     * emetteva `''` — che `parseListinoChoice` riporta a `'article'`, cioè
     * esattamente la seconda.
     *
     * ⚠️ **Per questo la guardia APRE il pannello.** La prova qui sopra legge
     * `component.listinoOptions()`, cioè l'array del modello, dove il duplicato
     * NON c'è: a metterlo è il template. Un test sul modello sarebbe rimasto
     * verde per tutto il tempo, ed è il motivo per cui il difetto è arrivato
     * fin qui.
     *
     * ⚠️ Per un lettore di schermo erano due `role="option"` fratelli con lo
     * stesso nome accessibile e `aria-selected` opposti: non un comando rotto,
     * due comandi identici di cui uno finto.
     */
    describe('e la tendina non ripete una voce', () => {
      /** Nomi delle voci come le annuncia un lettore di schermo. */
      function vociDelPannello(): string[] {
        return screen
          .getAllByRole('option')
          .map((voce) => voce.getAttribute('aria-label') ?? voce.textContent ?? '')
          .map((nome) => nome.replace(/\s+/g, ' ').trim());
      }

      it('⛔ «Prezzo di vendita» compare UNA volta sola', async () => {
        const user = userEvent.setup();
        await setup({ tenantSettings: CON_DUE_LISTINI });

        await user.click(screen.getByLabelText('Listino applicato alle righe'));

        expect(vociDelPannello().filter((nome) => nome === 'Prezzo di vendita')).toHaveLength(1);
      });

      it('⭐ e le voci sono ESATTAMENTE le sorgenti del tenant', async () => {
        const user = userEvent.setup();
        await setup({ tenantSettings: CON_DUE_LISTINI });

        await user.click(screen.getByLabelText('Listino applicato alle righe'));

        // ⚠️ L'uguaglianza, non un `toContain`: se domani ricomparisse una riga
        // in più, questa la vede anche se la sua etichetta fosse diversa —
        // mentre un controllo «contiene le tre giuste» resterebbe verde.
        expect(vociDelPannello()).toEqual(['Prezzo di vendita', 'Ingrosso', 'Outlet']);
      });
    });
  });

  /**
   * ⛔ **«Porto»: la stessa voce doppia, e qui era pure peggio** — 24/08/2026.
   *
   * `transportPortOptions` dichiara già la propria voce neutra
   * (`{ value: '', label: 'Non indicato' }`), e il controllo passava «Non
   * indicato» anche come segnaposto senza spegnere `includeEmptyOption`.
   *
   * ⚠️ **Peggio del Listino**: lì le due righe avevano valori diversi, qui hanno
   * anche **lo stesso valore** `''`. Siccome `isEmptySelected()` è
   * `(value ?? '') === ''` e `isSelected(option)` è `(value ?? '') ===
   * option.value`, con nessuna scelta fatta diventano **veri entrambi**: il
   * segno di spunta compariva su tutte e due le righe.
   */
  describe('la tendina Porto non ripete una voce', () => {
    function vociDelPannello(): string[] {
      return screen
        .getAllByRole('option')
        .map((voce) => voce.getAttribute('aria-label') ?? voce.textContent ?? '')
        .map((nome) => nome.replace(/\s+/g, ' ').trim());
    }

    it('⛔ «Non indicato» compare UNA volta sola, con UNA sola spunta', async () => {
      const user = userEvent.setup();
      await setup({ routeType: DocumentType.InvoiceAccompanying });

      await user.click(screen.getByLabelText('Porto del trasporto'));

      expect(vociDelPannello()).toEqual(['Non indicato', 'Franco', 'Assegnato']);
      // La spunta segna la voce corrente: se fosse su due righe, «corrente»
      // non vorrebbe più dire niente.
      expect(screen.getAllByRole('option', { selected: true })).toHaveLength(1);
    });
  });

  /**
   * ⭐ **Quarto consumer del risolutore comune** (`03c` §5).
   *
   * ⚠️ Il ripiego `productName || title` **non era presente** in questa
   * maschera: la descrizione portava già il solo nome. Quello che mancava era
   * tutto il resto — la variante non aveva una colonna, l'unità di misura non
   * aveva nemmeno un controllo, e la spunta di magazzino guardava un campo
   * solo invece di due.
   */
  describe('il richiamo articolo passa dal risolutore comune', () => {
    /** Un articolo con varianti, un servizio, e un articolo non gestito. */
    const CATALOGO = {
      maglia: {
        variantId: 'var-M',
        productId: 'p-M',
        sku: 'MAG-M',
        articleCode: 'ART-M',
        productName: 'Maglia',
        title: 'Maglia — M / Rosso',
        variantLabel: 'M / Rosso',
        unitOfMeasure: 'pz',
        sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
        defaultVatCodeId: 'iva-22',
        managesStock: true,
      },
      // ⛔ Un SERVIZIO: `managesStock` non è `false`, è ASSENTE. La vecchia
      // regola `managesStock !== false` gli faceva scattare la spunta.
      consulenza: {
        variantId: 'var-S',
        productId: 'p-S',
        sku: 'SRV-1',
        articleCode: 'ART-S',
        productName: 'Consulenza',
        title: 'Consulenza',
        variantLabel: '',
        kind: 'service',
        sellingPrice: { amountMinor: 10000, currencyCode: 'EUR' },
        defaultVatCodeId: 'iva-22',
      },
    };

    const VAT = [
      {
        id: 'iva-22',
        code: '22',
        description: 'Imponibile 22%',
        ratePercent: 22,
        calculationMode: 'standard',
        isActive: true,
        usageScope: 'both',
      },
    ];

    interface AccessoRiga {
      onVariantSelect: (index: number, variantId: string, known?: unknown) => void;
      lines: { at: (i: number) => { controls: Record<string, { value: unknown }> } };
    }

    async function conCatalogo() {
      const { component } = await setup({
        vatCodes: VAT,
        variantSummaries: [CATALOGO.maglia, CATALOGO.consulenza],
      });
      return component as unknown as AccessoRiga;
    }

    it('⛔ il nome non porta la variante, che ha la sua colonna', async () => {
      const form = await conCatalogo();

      form.onVariantSelect(0, 'var-M', CATALOGO.maglia);

      const riga = form.lines.at(0).controls;
      expect(riga['productName']!.value).toBe('Maglia');
      expect(riga['productName']!.value).not.toContain('—');
      expect(riga['variantLabel']!.value).toBe('M / Rosso');
    });

    it('articolo senza opzioni: etichetta vuota, non un ripiego sul titolo', async () => {
      const form = await conCatalogo();

      form.onVariantSelect(0, 'var-S', CATALOGO.consulenza);

      const riga = form.lines.at(0).controls;
      expect(riga['productName']!.value).toBe('Consulenza');
      expect(riga['variantLabel']!.value).toBe('');
    });

    it('⛔ un SERVIZIO non fa scattare «Scarica mag.»', async () => {
      const form = await conCatalogo();

      form.onVariantSelect(0, 'var-S', CATALOGO.consulenza);

      // La vecchia regola era `managesStock !== false`, e su un servizio
      // `managesStock` non è `false` — è assente. La spunta scattava, e una
      // consulenza scaricava magazzino.
      expect(form.lines.at(0).controls['loadsStock']!.value).toBe(false);
    });

    it('un articolo normale la fa scattare', async () => {
      const form = await conCatalogo();

      form.onVariantSelect(0, 'var-M', CATALOGO.maglia);

      expect(form.lines.at(0).controls['loadsStock']!.value).toBe(true);
    });

    it("⛔ l'unità di misura arriva sulla riga, e prima non aveva nemmeno un campo", async () => {
      const form = await conCatalogo();

      form.onVariantSelect(0, 'var-M', CATALOGO.maglia);

      expect(form.lines.at(0).controls['unitOfMeasure']!.value).toBe('pz');
    });
  });

  /**
   * ⛔ **La Fattura accompagnatoria scaricava senza avvisare — corretto il 26/08/2026.**
   *
   * I tipi che riducono giacenza sono tre: DDT vendita, Vendita manuale e Fattura
   * accompagnatoria. I primi due stanno sull'Ordine cliente e mostravano
   * disponibilità e avviso; questa maschera **né l'una né l'altro**.
   *
   * ⚠️ E la regola rende il buco grave: l'insufficienza di stock **non blocca mai**
   * (`regole-gestionale` «Controlli e validazioni», `CONTRATTO-COMUNE-DOCUMENTI`
   * §stock). Escluso il blocco, l'avviso è l'unico presidio: dove manca, lo
   * scarico oltre disponibile passa in perfetto silenzio.
   *
   * ⭐ **Mancava il dato, non la capacità**: `document-line-row.model` porta
   * `exceedsAvailability` e `availabilityHint` da sempre.
   */
  describe('SalesDocumentFormComponent — avviso di disponibilità sulle righe che scaricano', () => {
    interface FormaInterna {
      lineExceedsAvailability(index: number): boolean;
      lineAvailabilityHint(index: number): string | null;
    }

    function documento(loadsStock: boolean, quantity: number) {
      return {
        id: 'doc-1',
        type: DocumentType.InvoiceAccompanying,
        status: 'draft',
        series: 'A',
        year: 2026,
        number: 7,
        reference: 'FTA-0007',
        documentDate: '2026-08-26T00:00:00.000Z',
        currency: 'EUR',
        customerId: 'cus-1',
        locationId: 'loc-1',
        pricesIncludeVat: false,
        documentDiscountPercent: 0,
        lines: [
          {
            id: 'l-1',
            lineNumber: 1,
            description: 'Maglietta',
            variantId: 'var-1',
            quantity,
            unitPrice: { amountMinor: 1000, currencyCode: 'EUR' },
            discountPercent: 0,
            loadsStock,
          },
        ],
      };
    }

    /** Otto pezzi disponibili: il catalogo finto risponde anche alla ricerca per id. */
    const CATALOGO = [
      {
        variantId: 'var-1',
        productId: 'prod-1',
        productName: 'Maglietta',
        variantLabel: 'M',
        sku: 'SKU-1',
        kind: 'product',
        managesStock: true,
        stockAvailable: 8,
        sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
      },
    ];

    async function apri(loadsStock: boolean, quantity: number) {
      const view = await setup({
        routeType: DocumentType.InvoiceAccompanying,
        editDocument: documento(loadsStock, quantity),
        variantSummaries: CATALOGO,
      });
      return view.component as unknown as FormaInterna;
    }

    it('⛔ quantità 12 su disponibile 8: avvisa, e dice quanti ce ne sono', async () => {
      const form = await apri(true, 12);

      await waitFor(() => expect(form.lineAvailabilityHint(0)).toBe('disponibili solo 8'));
      expect(form.lineExceedsAvailability(0)).toBe(true);
    });

    it('⭐ entro il disponibile non dice niente', async () => {
      const form = await apri(true, 3);

      await waitFor(() => expect(form.lineExceedsAvailability(0)).toBe(false));
      expect(form.lineAvailabilityHint(0)).toBeNull();
    });

    it('⛔ e a decidere è la RIGA, non il tipo documento', async () => {
      // ⚠️ Stesso tipo, stessa quantità, stessa disponibilità: cambia solo
      //   `loadsStock`. Se l'avviso comparisse lo stesso, il gate sarebbe sul tipo
      //   — che è esattamente ciò che non doveva succedere.
      const form = await apri(false, 12);

      expect(form.lineExceedsAvailability(0)).toBe(false);
      expect(form.lineAvailabilityHint(0)).toBeNull();
    });
  });
});
