import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AuthService } from '@core/auth';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '@core/models/tenant-permission.model';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import { UserRole } from '@core/models/user.model';
import { LocationContextService } from '@core/services/location-context.service';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ToastService } from '@core/services/toast.service';
import { DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import type { DocumentCounterView } from '@domain/documents/models/document-counter.model';
import { ProductService } from '@domain/products/services/product.service';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import { TransferFormComponent } from './transfer-form.component';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';

const LOCATIONS = [
  { id: 'loc-1', name: 'Milano' },
  { id: 'loc-2', name: 'Roma' },
];

/** Contatore predefinito del tipo: propone la serie «A» e il numero 42. */
const COUNTER: DocumentCounterView = {
  id: 'cnt-1',
  type: DocumentType.Transfer,
  series: 'A',
  locationId: null,
  locationName: null,
  isDefault: true,
  nextNumber: 42,
  documentCount: 41,
};

function operationalLocationsMock(defaultLocation: { id: string; name: string } | null = null) {
  return {
    locations: () => LOCATIONS,
    writeLocations: () => LOCATIONS,
    actionLocations: () => LOCATIONS,
    transferTargetLocations: () => LOCATIONS,
    defaultLocation: () => defaultLocation,
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
}

/** Operatore non titolare: conta solo l'elenco permessi, mai il ruolo. */
function clerkWith(permissions: readonly TenantPermissionKey[]) {
  return { role: UserRole.Clerk, permissions: [...permissions] };
}

describe('TransferFormComponent', () => {
  async function setup(options?: {
    readonly defaultLocation?: { id: string; name: string } | null;
    /**
     * Permessi dell'operatore. Omesso, l'AuthService risponde «nessun utente»:
     * è il caso che serve alla maggior parte delle prove, dove i comandi
     * riservati non devono comparire.
     */
    readonly permissions?: readonly TenantPermissionKey[];
    /** Contatori proposti in testata (numero + serie). */
    readonly counters?: readonly DocumentCounterView[];
    /** Documento restituito dal server al salvataggio (numero assegnato). */
    readonly createdDocument?: Partial<DocumentRecord>;
  }) {
    const counters = options?.counters ?? [];
    const documentService = {
      // Controllo cronologico (§4): serie in ordine, nessun avviso.
      checkChronology: () => of({ conflicts: [], dismissed: false }),
      dismissChronologyWarning: () => of(void 0),
      getDocumentById: vi.fn(),
      createDocument: vi.fn(() =>
        of({ id: 'doc-9', ...options?.createdDocument } as DocumentRecord),
      ),
      updateDocument: vi.fn(),
      saveTransfer: vi.fn(),
      confirmDocument: vi.fn(),
    };
    const toasts = { showInfo: vi.fn(), showError: vi.fn() };

    const rendered = await render(TransferFormComponent, {
      providers: [
        {
          provide: DocumentCountersService,
          useValue: {
            available: () =>
              of({
                counters,
                proposedCounterId: counters.find((entry) => entry.isDefault)?.id ?? null,
              }),
          },
        },
        { provide: ToastService, useValue: toasts },
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
        // Senza `permissions` non c'è alcun utente collegato: nessun permesso
        // costi (il selettore articolo non mostra il costo) e nessun comando
        // riservato in testata. È il caso normale delle prove qui sotto.
        {
          provide: AuthService,
          useValue: {
            currentUser: () => (options?.permissions ? clerkWith(options.permissions) : null),
          },
        },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          // `queryParamMap` nello snapshot serve davvero: la maschera lo legge
          // in `afterNextRender` per il precompilato da «Duplica documento».
          useValue: {
            snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
            paramMap: of(convertToParamMap({})),
          },
        },
        {
          provide: OperationalLocationsService,
          useValue: operationalLocationsMock(options?.defaultLocation ?? null),
        },
        {
          provide: LocationContextService,
          useValue: { activeLocationId: () => null, setActiveLocation: vi.fn() },
        },
        { provide: ProductService, useValue: { searchVariantSummaries: () => of([]) } },
        // Il documento della controparte in testata porta con sé la tendina dei
        // tipi: senza questo doppio la maschera chiederebbe HTTP al render.
        {
          provide: ExternalDocumentTypeService,
          useValue: { list: () => of([]) },
        },
        { provide: DocumentService, useValue: documentService },
      ],
    });

    // Dopo il salvataggio la maschera va al dettaglio: qui non c'è alcuna rotta
    // registrata, e una navigazione fallita lascerebbe una promise rigettata
    // che non c'entra nulla con ciò che il test verifica.
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    return { ...rendered, documentService, toasts, navigate };
  }

  // ── Invio nei campi di testata NON deve salvare ──────────────────────────
  //
  // ⛔ **Regola funzionale, decisa dal proprietario il 24/08/2026.** Invio serve
  // alla conferma e alla navigazione del campo in cui ci si trova; il
  // salvataggio esplicito resta il pulsante Salva e la scorciatoia Ctrl/Cmd+S.
  //
  // ⚠️ **Perche' si guarda l'evento `submit` e non il servizio.** Verificare che
  // `createDocument` non sia stato chiamato non distingue due cose molto
  // diverse: che l'Invio non abbia inviato il modulo (giusto), e che l'abbia
  // inviato ma il salvataggio si sia fermato sulla validazione (difetto
  // mascherato). Il modulo che riceve un `submit` e' il fenomeno da osservare.
  //
  // ⚠️ E il banco di prova E' in grado di vederlo: verificato a parte che in
  // questo ambiente premere Invio in un campo di testo dentro un `<form>`
  // provoca davvero la submission implicita dell'HTML. Senza quella verifica
  // queste prove sarebbero verdi e vuote.
  describe('Invio in testata', () => {
    async function documentoPronto() {
      const rendered = await setup({ counters: [COUNTER] });
      await rendered.fixture.whenStable();
      rendered.fixture.detectChanges();
      const modulo = rendered.container.querySelector('form');
      const inviato = vi.fn();
      modulo?.addEventListener('submit', inviato);
      return { ...rendered, modulo, inviato };
    }

    it('⛔ Invio nel campo Numero non invia il modulo', async () => {
      const user = userEvent.setup();
      const rendered = await documentoPronto();
      expect(rendered.modulo).not.toBeNull();

      const numero = screen.getByLabelText<HTMLInputElement>('Numero');
      await user.clear(numero);
      await user.type(numero, '77{enter}');
      rendered.fixture.detectChanges();

      expect(rendered.inviato).not.toHaveBeenCalled();
      expect(rendered.documentService.createDocument).not.toHaveBeenCalled();
    });

    it('⛔ Invio nel campo Data non invia il modulo', async () => {
      const user = userEvent.setup();
      const rendered = await documentoPronto();

      const data = screen.getByLabelText<HTMLInputElement>('Data documento');
      await user.click(data);
      await user.keyboard('{enter}');
      rendered.fixture.detectChanges();

      expect(rendered.inviato).not.toHaveBeenCalled();
      expect(rendered.documentService.createDocument).not.toHaveBeenCalled();
    });

    it('⛔ e nemmeno il campo Riferimento, che e un campo di testo qualunque', async () => {
      const user = userEvent.setup();
      const rendered = await documentoPronto();

      const campi = screen.queryAllByRole<HTMLInputElement>('textbox');
      const testo = campi.find((campo) => campo.type === 'text' && !campo.readOnly);
      if (!testo) {
        // Nessun campo di testo libero in testata: niente da verificare qui.
        return;
      }
      await user.type(testo, 'x{enter}');
      rendered.fixture.detectChanges();

      expect(rendered.inviato).not.toHaveBeenCalled();
    });
  });

  // Regressione: le opzioni della location di destinazione escludono l'origine.
  // targetLocationOptions e' un computed che legge locationId dal FormControl
  // (non signal): deve ri-filtrare quando l'origine cambia, non restare fisso.
  it('ri-filtra le destinazioni escludendo la nuova origine selezionata', async () => {
    const user = userEvent.setup();
    await setup();

    // Cambia origine da Milano (default) a Roma.
    await user.click(screen.getByRole('button', { name: 'Location origine' }));
    await user.click(screen.getByRole('option', { name: 'Roma' }));

    // La destinazione ora deve poter offrire Milano (non piu' Roma, ora origine).
    await user.click(screen.getByRole('button', { name: 'Location destinazione' }));
    expect(screen.getByRole('option', { name: 'Milano' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Roma' })).toBeNull();
  });

  // Specifica «sede predefinita»: puo' precompilare SOLO l'origine; la
  // destinazione non viene MAI autocompilata.
  it('precompila la sola origine con la sede predefinita; destinazione mai autocompilata', async () => {
    await setup({ defaultLocation: LOCATIONS[0] });

    const origin = screen.getByRole('button', { name: 'Location origine' });
    expect(origin).toHaveTextContent('Milano (predefinita)');

    const target = screen.getByRole('button', { name: 'Location destinazione' });
    expect(target).toHaveTextContent('Seleziona destinazione…');
  });

  // Senza predefinita (utente multi-sede): nessun fallback "prima location
  // disponibile", entrambi i campi partono vuoti.
  it('senza sede predefinita non autoseleziona origine ne destinazione', async () => {
    await setup();

    expect(screen.getByRole('button', { name: 'Location origine' })).toHaveTextContent(
      'Seleziona origine…',
    );
    expect(screen.getByRole('button', { name: 'Location destinazione' })).toHaveTextContent(
      'Seleziona destinazione…',
    );
  });

  // Il trio della controparte (tipo · numero · data) NON sta su questa maschera
  // (08/2026): un trasferimento fra sedi proprie non ha una controparte, e tre
  // celle sempre vuote in cima alla testata chiedevano di essere compilate senza
  // che ci fosse niente da scrivere. La prova che c'era qui verificava che
  // comparissero: ora verifica che non ci siano.
  it('non chiede il documento della controparte: non c’è una controparte', async () => {
    await setup();

    expect(screen.queryByLabelText('Numero documento')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tipo documento' })).toBeNull();
  });

  // Senza «documents.configure» l'ingranaggio accanto alla serie non compare:
  // l'API nega la scrittura delle numerazioni, il comando risponderebbe 403.
  it('nasconde «Gestisci numerazioni» a chi non configura i documenti', async () => {
    await setup({ permissions: [] });

    expect(screen.queryByRole('button', { name: 'Gestisci numerazioni' })).toBeNull();
  });

  it('mostra «Gestisci numerazioni» a chi ha documents.configure', async () => {
    await setup({ permissions: [TenantPermission.DocumentsConfigure] });

    // ⛔ **Una guardia che tollera il difetto non e' una guardia.** Qui si
    // prendeva il PRIMO di piu' risultati, e il commento diceva «il campo vive
    // in due viste»: era vero finche' la testata si scriveva due volte. Da
    // quando si dichiara una volta sola, quel plurale accetterebbe il ritorno
    // della copia senza dire niente — e la copia e' proprio il difetto appena
    // chiuso. La forma singolare fallisce, ed e' il punto.
    expect(screen.getByRole('button', { name: 'Gestisci numerazioni' })).toBeTruthy();
  });

  // ── Numero: proposta vs imposizione ───────────────────────────────────────
  // Il numero proposto all'apertura non è prenotato: se tornasse al server
  // come scelta, il secondo operatore riceverebbe un conflitto per un numero
  // che gli aveva suggerito la maschera.
  describe('numero documento', () => {
    /** Riempie il minimo indispensabile perché il salvataggio parta. */
    function fillMinimumValidDocument(component: TransferFormComponent): void {
      component.form.controls.locationId.setValue('loc-1');
      component.form.controls.targetLocationId.setValue('loc-2');
      const line = component['lines'].at(0);
      line.controls.variantId.setValue('var-1');
      line.controls.productName.setValue('Maglia · M');
    }

    it('la proposta arriva in testata senza sporcare il controllo', async () => {
      const { fixture } = await setup({ counters: [COUNTER] });
      await fixture.whenStable();
      fixture.detectChanges();

      // Il campo mostra il primo libero…
      expect(screen.getByLabelText<HTMLInputElement>('Numero').value).toBe('42');
      // …ma resta una proposta: il controllo non è dirty.
      expect(fixture.componentInstance.form.controls.documentNumber.dirty).toBe(false);
    });

    it('numero non toccato: il salvataggio NON porta il numero', async () => {
      const { fixture } = await setup({ counters: [COUNTER] });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      const body = component['buildSaveTransferBody']('doc-1', component.form.getRawValue());
      expect(body.number).toBeUndefined();
    });

    it('numero digitato: viaggia al server, che è dove il conflitto ha senso', async () => {
      const { fixture } = await setup({ counters: [COUNTER] });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      component['numbering'].onNumberChange(77);

      const body = component['buildSaveTransferBody']('doc-1', component.form.getRawValue());
      expect(body.number).toBe(77);
    });

    it('mostra l’avviso di proposta finché l’operatore non tocca il numero', async () => {
      const user = userEvent.setup();
      const { fixture } = await setup({ counters: [COUNTER] });
      await fixture.whenStable();
      fixture.detectChanges();

      // ⛔ Qui si asserivano DUE copie, «testata desktop e pannello mobile
      // convivono nel DOM»: era la doppia scrittura della testata, e il test la
      // sorvegliava invece di segnalarla. Ora la testata si dichiara una volta
      // e le due vesti sono esclusive — la copia e' una.
      expect(screen.getAllByText(/Primo libero/)).toHaveLength(1);

      const numberInput = screen.getByLabelText<HTMLInputElement>('Numero');
      await user.clear(numberInput);
      await user.type(numberInput, '77');
      fixture.detectChanges();

      // Ora il numero è una scelta: l'avviso sparisce.
      expect(screen.queryAllByText(/Primo libero/)).toHaveLength(0);
    });

    it('numero soffiato da un altro operatore: lo dice con un avviso informativo', async () => {
      const { fixture, toasts } = await setup({
        counters: [COUNTER],
        // Il server ha assegnato il primo libero al momento del commit: il 42
        // nel frattempo era stato preso.
        createdDocument: { number: 46 },
      });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      fillMinimumValidDocument(component);
      component['persist']();

      expect(toasts.showInfo).toHaveBeenCalledWith(
        'Salvato con il n. 46: il 42 è stato preso da un altro operatore.',
      );
    });

    it('numero assegnato uguale alla proposta: nessun avviso', async () => {
      const { fixture, toasts } = await setup({
        counters: [COUNTER],
        createdDocument: { number: 42 },
      });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      fillMinimumValidDocument(component);
      component['persist']();

      expect(toasts.showInfo).not.toHaveBeenCalled();
    });

    // Numero scelto dall'operatore: se è occupato esiste già il dialogo di
    // conflitto. Un toast in più sopra quello confonde invece di informare.
    it('numero imposto: nessun avviso, il conflitto ha già il suo dialogo', async () => {
      const { fixture, toasts } = await setup({
        counters: [COUNTER],
        createdDocument: { number: 46 },
      });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      component['numbering'].onNumberChange(42);
      fillMinimumValidDocument(component);
      component['persist']();

      expect(toasts.showInfo).not.toHaveBeenCalled();
    });
  });

  // ── Documento vuoto ──────────────────────────────────────────────────────
  //
  // ⭐ **Decisione del proprietario, 25/08/2026**, chiesta per TUTTI i tipi:
  //
  // > «Se non ho fatto nulla nel documento e lo salvo, devo avere la
  // >  possibilità di crearlo vuoto e avrò un documento vuoto con numero,
  // >  eventuale serie e data. Ovunque deve essere così.»
  //
  // ⚠️ **Le due prove vanno in coppia, e da sole non valgono.** La prima da
  // sola si soddisfa togliendo il controllo; la seconda inchioda che cosa il
  // controllo continua a fermare. Toglierne una lascia l'altra a difendere
  // metà della decisione.
  describe('documento vuoto', () => {
    it('⭐ coi soli campi obbligatori il salvataggio parte, e le righe sono zero', async () => {
      const { fixture, documentService } = await setup({ counters: [COUNTER] });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      // I soli obbligatori del trasferimento: origine e destinazione. La data
      // la porta gia' la maschera all'apertura.
      component.form.controls.locationId.setValue('loc-1');
      component.form.controls.targetLocationId.setValue('loc-2');

      component['persist']();

      expect(documentService.createDocument).toHaveBeenCalled();
      // Il mock non dichiara parametri, quindi `calls` e' tipata come tupla
      // vuota: il corpo si legge passando da `unknown`.
      const [body] = documentService.createDocument.mock.calls[0] as unknown as readonly [
        { lines: unknown[] },
      ];
      // ⚠️ Non basta «e' stato chiamato»: la riga seminata all'apertura deve
      // essere stata TOLTA. Se arrivasse al server, il documento non sarebbe
      // vuoto — porterebbe una riga senza articolo.
      expect(body.lines).toEqual([]);
    });

    it('⛔ una riga con qualcosa dentro ma INCOMPLETA ferma ancora il salvataggio', async () => {
      // ⚠️ E' il rischio vero del cambiamento: le righe vuote in coda ora si
      // scartano TUTTE, e una riga toccata a meta' non deve finire nello stesso
      // sacco. Vuota si butta; iniziata e incompleta si segnala.
      //
      // ⛔ Qui la prova diceva «righe presenti ma nessuna che muova giacenza».
      // Non poteva arrivarci: nel Trasferimento variantId e productName sono
      // obbligatori e quantity ha min(1), quindi una riga formalmente valida
      // muove SEMPRE giacenza — la ferma prima `lines.invalid`, con un
      // messaggio piu' preciso. Il controllo `righeSenzaEffetto` resta come
      // rete per i tipi documento dove quei validatori non ci sono.
      const { fixture, documentService } = await setup({ counters: [COUNTER] });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      component.form.controls.locationId.setValue('loc-1');
      component.form.controls.targetLocationId.setValue('loc-2');
      component['lines'].at(0).controls.productName.setValue('Riga iniziata');

      component['persist']();

      expect(documentService.createDocument).not.toHaveBeenCalled();
      expect(component['_formErrorMessage']()).toContain('completa le righe evidenziate');
    });
  });
});

/**
 * ⭐ **Il Trasferimento è il primo consumer del risolutore comune** (`03c` §5).
 *
 * Non è un refactor: è il gesto — «richiamo un articolo sulla riga» — che
 * smette di essere scritto sette volte in modo diverso.
 *
 * ⛔ Questi test descrivono il comportamento **desiderato**, non quello
 * osservato. Il codice di oggi ne fa fallire due apposta: scrive
 * `nome · titolo` nella descrizione, e il titolo contiene già il nome —
 * quindi il nome finisce sulla riga **due volte**, «Maglia · Maglia — M / Rosso»
 * (`03` §28: il codice attuale non è la fonte dei requisiti).
 */
describe('il richiamo articolo passa dal risolutore comune', () => {
  /** L'articolo con opzioni: il caso in cui nome e variante vanno separati. */
  const MAGLIA: VariantSummary = {
    variantId: 'var-1',
    productId: 'prod-1',
    sku: 'MAG-M',
    articleCode: 'ART-1',
    productName: 'Maglia',
    title: 'Maglia — M / Rosso',
    variantLabel: 'M / Rosso',
    barcode: '8001',
    sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
  };

  /** Prodotto SENZA opzioni: l'etichetta resta vuota, non ripiega sul titolo. */
  const CINTURA: VariantSummary = {
    variantId: 'var-2',
    productId: 'prod-2',
    sku: 'CIN-U',
    articleCode: 'ART-2',
    productName: 'Cintura',
    title: 'Cintura',
    variantLabel: '',
    sellingPrice: { amountMinor: 1900, currencyCode: 'EUR' },
  };

  /**
   * L'accesso alla riga. Il gesto vero passa per il pannello articoli e tre
   * celle di codice: rifarlo a mano in ogni prova misurerebbe il pannello, non
   * il richiamo. Stesso taglio già usato in `goods-receipt-form.component.spec`.
   */
  interface FormaRiga {
    readonly lines: {
      readonly length: number;
      at(i: number): { controls: Record<string, { value: unknown; setValue(v: unknown): void }> };
    };
    onVariantSelect(index: number, value: string | null, known?: VariantSummary | null): void;
  }

  async function setupCatalogo(catalogo: readonly VariantSummary[]) {
    const view = await render(TransferFormComponent, {
      providers: [
        {
          provide: DocumentCountersService,
          useValue: { available: () => of({ counters: [], proposedCounterId: null }) },
        },
        { provide: ToastService, useValue: { showInfo: vi.fn(), showError: vi.fn() } },
        {
          provide: APP_CONFIG,
          useValue: {
            production: false,
            appName: 'VestiFlow',
            apiBaseUrl: '',
            features: { barcodeScanner: false, shopify: false },
          },
        },
        { provide: AuthService, useValue: { currentUser: () => null } },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
            paramMap: of(convertToParamMap({})),
          },
        },
        { provide: OperationalLocationsService, useValue: operationalLocationsMock(null) },
        {
          provide: LocationContextService,
          useValue: { activeLocationId: () => null, setActiveLocation: vi.fn() },
        },
        {
          provide: ProductService,
          useValue: {
            searchVariantSummaries: (params?: { readonly variantId?: string }) =>
              of(
                params?.variantId
                  ? catalogo.filter((row) => row.variantId === params.variantId)
                  : [...catalogo],
              ),
            getSupplierVariantLinks: () => of([]),
          },
        },
        { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
        {
          provide: DocumentService,
          useValue: {
            checkChronology: () => of({ conflicts: [], dismissed: false }),
            dismissChronologyWarning: () => of(void 0),
            getDocumentById: vi.fn(),
            createDocument: vi.fn(() => of({ id: 'doc-9' } as DocumentRecord)),
            updateDocument: vi.fn(),
            saveTransfer: vi.fn(),
            confirmDocument: vi.fn(),
          },
        },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    return view.fixture.componentInstance as unknown as FormaRiga;
  }

  it('⛔ il nome non porta la variante, che ha la sua colonna', async () => {
    const form = await setupCatalogo([MAGLIA]);

    form.onVariantSelect(0, MAGLIA.variantId, MAGLIA);

    const riga = form.lines.at(0).controls;
    // Il difetto che questo consumer chiude: oggi qui c'è
    // «Maglia · Maglia — M / Rosso», col nome scritto due volte.
    expect(riga['productName']!.value).toBe('Maglia');
    expect(riga['productName']!.value).not.toContain('·');
    expect(riga['variantLabel']!.value).toBe('M / Rosso');
  });

  it('articolo senza opzioni: etichetta vuota, non un ripiego sul titolo', async () => {
    const form = await setupCatalogo([CINTURA]);

    form.onVariantSelect(0, CINTURA.variantId, CINTURA);

    const riga = form.lines.at(0).controls;
    expect(riga['productName']!.value).toBe('Cintura');
    expect(riga['variantLabel']!.value).toBe('');
  });

  it('le tre chiavi di identità arrivano tutte insieme', async () => {
    const form = await setupCatalogo([MAGLIA]);

    form.onVariantSelect(0, MAGLIA.variantId, MAGLIA);

    const riga = form.lines.at(0).controls;
    expect(riga['sku']!.value).toBe('MAG-M');
    expect(riga['articleCode']!.value).toBe('ART-1');
    expect(riga['barcode']!.value).toBe('8001');
  });

  it('richiamando lo stesso articolo i valori tornano da anagrafica, la quantità no', async () => {
    const form = await setupCatalogo([MAGLIA]);
    form.onVariantSelect(0, MAGLIA.variantId, MAGLIA);

    const riga = form.lines.at(0).controls;
    riga['productName']!.setValue('Scritto a mano');
    riga['quantity']!.setValue(7);

    form.onVariantSelect(0, MAGLIA.variantId, MAGLIA);

    // ⭐ Il richiamo RISCRIVE i valori dell'articolo — è la decisione del
    // proprietario, e vale per tutti i documenti.
    expect(riga['productName']!.value).toBe('Maglia');
    // ⛔ …ma NON la quantità, che è dell'operatore.
    expect(riga['quantity']!.value).toBe(7);
  });

  it('articolo illeggibile: non scrive niente di parziale', async () => {
    const form = await setupCatalogo([MAGLIA]);
    form.onVariantSelect(0, MAGLIA.variantId, MAGLIA);

    // Una variante che il catalogo non conosce: il risolutore dichiara
    // l'articolo illeggibile, e la riga NON si svuota a metà.
    form.onVariantSelect(0, 'var-ignota', null);

    const riga = form.lines.at(0).controls;
    expect(riga['productName']!.value).toBe('Maglia');
    expect(riga['sku']!.value).toBe('MAG-M');
    expect(riga['variantLabel']!.value).toBe('M / Rosso');
  });
});
