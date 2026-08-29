import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@core/auth';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import type { UserEvent } from '@testing-library/user-event';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorKind } from '@core/models/app-error.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { ViewportService } from '@core/services/viewport.service';
import { ProductService } from '@domain/products/services/product.service';

import { SupplierOrderFormComponent } from './supplier-order-form.component';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { DocumentType } from '@core/models/document.model';
import { DocumentService } from '@domain/documents/services/document.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { signal } from '@angular/core';
import { APP_CONFIG } from '@core/config/app-config.token';

const SUPPLIERS = [
  { id: 'sup-1', tenantId: 't1', name: 'Tessuti Italia', email: null, phone: null },
];
// Dichiarato COL TIPO: un campo obbligatorio che manca deve essere un errore di
// compilazione, non un calcolo che esplode in silenzio dentro il pannello dei
// suggerimenti e una prova che poi dice «non trovo la voce».
const VARIANTS: readonly VariantSummary[] = [
  {
    variantId: 'var-1',
    productId: 'prod-1',
    productName: 'Maglietta',
    title: 'Maglietta / M / Rosso',
    // ⚠️ Era `''`, messo solo per soddisfare il tipo: nessun test lo leggeva, e
    // il ripiego `productName || title` non e' MAI stato eseguito in nessuna
    // prova, perche' `productName` non e' vuoto. Il difetto viveva scoperto.
    variantLabel: 'M / Rosso',
    sku: 'MAG-M-ROSSO',
    articleCode: 'ART-MAG',
    // Obbligatorio nel modello: senza, il dettaglio del suggerimento esplode e
    // il pannello resta vuoto senza dire perché. Il dato di prova mentiva al tipo.
    sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
  },
  /**
   * ⚠️ **L'articolo che ARMA il divieto di ripiego.**
   *
   * `productName` vuoto e `title` pieno: e' l'unica forma di dato che esegue
   * il ramo `productName || title`. Con il solo articolo qui sopra — nome non
   * vuoto — togliere il ripiego o lasciarlo dava lo stesso risultato in ogni
   * prova, e il difetto e' vissuto scoperto fino al 24/08/2026.
   *
   * Il contratto dice che qui il nome esce VUOTO: se `productName` manca e' la
   * summary a essere sbagliata, e si corregge la summary. Ripiegare sul titolo
   * rimetterebbe la variante dentro il nome proprio nel caso in cui nessuno
   * se ne accorge.
   */
  {
    variantId: 'var-senza-nome',
    productId: 'prod-2',
    productName: '',
    title: 'Felpa / L / Blu',
    variantLabel: 'L / Blu',
    sku: 'FEL-L-BLU',
    articleCode: 'ART-FEL',
    sellingPrice: { amountMinor: 4990, currencyCode: 'EUR' },
  },
];

/** Tipi del documento della controparte (tendina condivisa di testata). */
const EXTERNAL_DOC_TYPES = [
  {
    id: 'edt-ddt',
    name: 'Documento di trasporto',
    shortLabel: 'DDT',
    isSystem: true,
    isActive: true,
    sortOrder: 1,
  },
];

/**
 * Sceglie il fornitore in testata. Da 11/08/2026 è il PRESUPPOSTO delle righe:
 * senza, le righe non esistono e al loro posto c'è lo stato vuoto. I test che
 * toccano una riga devono passare di qui, come ci passa l'operatore.
 */
async function scegliFornitore(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Fornitore' }));
  await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));
}

/**
 * Sceglie l'articolo sulla prima riga passando dalla cella nome CONDIVISA:
 * si digita e si prende dall'elenco che si apre sotto. Prima qui c'era una
 * tendina — era la divergenza rispetto all'Ordine cliente, e questi test la
 * descrivevano.
 */
async function scegliArticoloSullaRiga(user: UserEvent): Promise<void> {
  // Le righe esistono solo a fornitore scelto: se non lo è ancora, lo si sceglie
  // qui invece di lasciare la prova a cercare un campo che non c'è.
  if (screen.queryAllByLabelText('Nome prodotto').length === 0) {
    await scegliFornitore(user);
  }
  await user.type(screen.getAllByLabelText('Nome prodotto')[0]!, 'mag');
  await user.click(await screen.findByRole('option', { name: /MAG-M-ROSSO/ }));
}

function tableColumnPreferenceMock() {
  const defaultState = {
    presetId: 'default' as const,
    columnOrder: ['product', 'quantity', 'unitCost', 'discount', 'vat', 'lineTotal', 'actions'],
    hiddenColumnIds: [] as string[],
    pinnedColumnIds: [] as string[],
    columnWidths: {} as Record<string, number>,
  };
  const stateSignal = signal(defaultState);
  return {
    registerView: vi.fn(),
    isColumnVisible: vi.fn(
      (_view: unknown, columnId: string) => !defaultState.hiddenColumnIds.includes(columnId),
    ),
    columnWidth: vi.fn((_view: unknown, _id: string, fallback: number) => fallback),
    setColumnWidth: vi.fn(),
    state: vi.fn(() => stateSignal.asReadonly()),
    columnDefs: vi.fn(() => []),
    presetMap: vi.fn(() => ({})),
    visibleColumns: vi.fn(() => () => []),
    visibleColumnIds: vi.fn(() => defaultState.columnOrder),
    applyPreset: vi.fn(),
    toggleColumn: vi.fn(),
    moveColumn: vi.fn(),
    togglePin: vi.fn(),
    resetToDefault: vi.fn(),
  };
}

const VAT_10 = {
  id: 'vat-10',
  code: '10',
  description: 'Aliquota ridotta',
  ratePercent: 10,
  nonDeductiblePercent: 0,
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
  isActive: true,
  isDefault: false,
  usageScope: 'both',
};

const VAT_22 = {
  id: 'vat-22',
  code: '22',
  description: 'Aliquota ordinaria',
  ratePercent: 22,
  nonDeductiblePercent: 0,
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
  isActive: true,
  isDefault: true,
  usageScope: 'both',
};

/**
 * Il pulsante di salvataggio esiste DUE volte: barra desktop e barra mobile,
 * entrambe nel DOM perché questa maschera non ha ancora viste esclusive (vedi
 * il difetto «due viste vive» nella mappa tecnica). Finché non le ha, la prova
 * pilota la prima — quella desktop.
 *
 * ⚠️ Prima i due pulsanti si distinguevano per NOME («Salva ordine» contro
 * «Salva»): l'ambiguità c'era già, la differenza di etichetta la nascondeva.
 * Allineare i nomi non l'ha creata, l'ha resa visibile.
 */
function salvaDocumento(): HTMLElement {
  return screen.getAllByRole('button', { name: 'Salva documento' })[0]!;
}

/**
 * ⚠️ **Le etichette sono quelle della RIGA E DELL'INTESTAZIONE COMUNI**, non
 * piu' quelle del markup locale:
 *
 *   «Quantità ordinata»       → «Quantità riga N»      dice QUALE riga
 *   «Ordina per SKU»          → «SKU: ordina crescente» dice anche il VERSO
 *
 * Prevale l'Ordine cliente (decisione del 24/08/2026), e le due forme comuni
 * dicono di piu': a voce, «Quantita' ordinata» ripetuto su venti righe non ne
 * distingue nessuna.
 */
describe('SupplierOrderFormComponent', () => {
  // ⛔ Qui c'era il polyfill di `<dialog>` per jsdom, copiato in TRE spec.
  // Portato in `src/test-setup.ts` il 25/08/2026: una copia mancante non si
  // vede — la prova che apre il dialogo semplicemente non esiste ancora.

  async function setup(options?: {
    createFails?: boolean;
    vatCodes?: readonly unknown[];
    // La vista viva: sotto la soglia la testata è il pannello, sopra la griglia.
    // Le due sono ESCLUSIVE, quindi una prova che riguarda la testata deve dire
    // quale sta guardando.
    compatta?: boolean;
  }) {
    const createOrder = options?.createFails
      ? vi.fn(() =>
          throwError(() => ({
            kind: AppErrorKind.Server,
            message: 'Errore del server. Riprova più tardi.',
          })),
        )
      : vi.fn(() => of({ id: 'po-1', status: SupplierOrderStatus.Confirmed }));

    const { fixture } = await render(SupplierOrderFormComponent, {
      providers: [
        // Nessun permesso costi: il selettore articolo non deve mostrare il costo.
        { provide: AuthService, useValue: { currentUser: () => null } },
        // Senza il foglio globale la soglia non è leggibile e il servizio vero
        // resta sulla vista estesa: la vista compatta si chiede.
        { provide: ViewportService, useValue: { compact: () => options?.compatta === true } },
        // Catch-all: il test «ritorno alla lista» naviga davvero verso /app/orders.
        provideRouter([{ path: '**', children: [] }]),
        // Serve da quando l'ordine fornitore ha gli allegati: in modifica il
        // pannello costruisce AttachmentsApiService, che legge la config.
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
          provide: SupplierService,
          useValue: {
            getSuppliers: () => of(SUPPLIERS),
            createSupplier: vi.fn(),
          },
        },
        {
          provide: ProductService,
          useValue: {
            searchVariantSummaries: (query?: { search?: string }) =>
              query?.search && query.search.length >= 2 ? of(VARIANTS) : of([]),
          },
        },
        {
          provide: SupplierOrderService,
          useValue: {
            createOrder,
          },
        },
        // Modalità costi iniziale del nuovo ordine: preferenza operatore per tipo.
        {
          provide: DocumentService,
          useValue: {
            getPriceModePreference: () => of(false),
            checkChronology: () => of({ conflicts: [], dismissed: false }),
            dismissChronologyWarning: () => of(void 0),
          },
        },
        // Tendina del documento della controparte (componente condiviso in
        // testata): senza lo stub cercherebbe l'HTTP vero.
        { provide: ExternalDocumentTypeService, useValue: { list: () => of(EXTERNAL_DOC_TYPES) } },
        // Numerazione propria (§5 Categoria A): il contatore predefinito
        // propone serie e primo numero libero.
        {
          provide: DocumentCountersService,
          useValue: {
            available: () =>
              of({
                counters: [
                  {
                    id: 'cnt-1',
                    type: DocumentType.SupplierOrder,
                    series: 'A',
                    locationId: null,
                    locationName: null,
                    isDefault: true,
                    nextNumber: 42,
                    documentCount: 41,
                  },
                ],
                proposedCounterId: 'cnt-1',
              }),
          },
        },
        {
          provide: TableColumnPreferenceService,
          useValue: tableColumnPreferenceMock(),
        },
        {
          provide: VatCodeService,
          useValue: { list: () => of(options?.vatCodes ?? []) },
        },
        {
          provide: PaymentOptionsService,
          useValue: { list: () => of([]) },
        },
      ],
    });

    return { fixture, createOrder };
  }

  /**
   * Qui si asseriva la presenza del sottotitolo «Numerazione (dai Numeratori):
   * prossimo riferimento OF-…». Quel numero era calcolato senza la sede e senza
   * la data del documento — una regola diversa da quella che lo assegna (§2) —
   * quindi contraddiceva il campo Numero della testata, che le usa entrambe.
   * Il numero vero è uno solo, e sta in testata.
   */
  it('non affianca al titolo un secondo numero', async () => {
    await setup();

    expect(screen.queryByText(/prossimo riferimento/i)).toBeNull();
  });

  // ── Numerazione propria (specifica numerazione §5, Categoria A) ────────────
  //
  // Fino al 12/08/2026 l'Ordine fornitore era l'unico documento della categoria
  // senza numero né serie in testata: il server lo numerava d'ufficio e
  // l'operatore non vedeva niente.

  /**
   * ⭐ **La testata esiste UNA volta sola.** Fino al 24/08/2026 era scritta due
   * volte nello stesso file — griglia desktop e pannello mobile — ed entrambe
   * stavano nel DOM: ogni campo aveva due identificativi (`po-m-*` e `po-*`),
   * e le prove prendevano `[0]` per non inciampare nel gemello. Da qui in poi
   * `findByLabelText` fallisce se qualcuno la riscrive due volte.
   */
  it('il campo Numero esiste una volta sola, non una per vista', async () => {
    await setup();

    expect(await screen.findAllByLabelText('Numero')).toHaveLength(1);
  });

  /**
   * La modalità costo è un comando di DOCUMENTO — decide come si leggono tutti
   * i costi, non uno — e per questo sta fra i dati di testata, non sopra le
   * righe. Su scrivania lo stesso comando vive già nell'intestazione della
   * colonna Costo: dichiararlo anche in testata lo metterebbe due volte nella
   * stessa schermata.
   */
  it('modalità costo: campo di testata nella vista compatta', async () => {
    await setup({ compatta: true });

    expect(
      await screen.findByRole('button', { name: 'Modalità costo netto o ivato' }),
    ).toBeVisible();
  });

  it("modalità costo: non in testata sulla vista estesa, dov'è nella colonna Costo", async () => {
    await setup();

    expect(screen.queryByRole('button', { name: 'Modalità costo netto o ivato' })).toBeNull();
  });

  it('propone in testata serie e primo numero libero', async () => {
    await setup();

    const numero = await screen.findByLabelText<HTMLInputElement>('Numero');
    expect(numero.value).toBe('42');
  });

  // La regola centrale: la proposta NON torna indietro come imposizione, o due
  // operatori che salvano insieme si contenderebbero lo stesso numero.
  /**
   * Né numero né serie viaggiano finché l'operatore non li tocca: quello che la
   * testata mostra è una PROPOSTA, e a decidere è il server nella transazione
   * che scrive.
   *
   * Sulla serie è cambiato il 13/08/2026 (§1-bis): prima viaggiava anche non
   * toccata, perché la proposta la scriveva nel campo e il campo partiva. Ora
   * parte solo se scelta — e allora parte davvero, «Senza serie» compresa, che
   * è il difetto che quella regola chiude.
   */
  it('numero e serie non toccati: il salvataggio non li porta', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup();

    await scegliArticoloSullaRiga(user);
    await user.click(salvaDocumento());

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ series: undefined, number: undefined }),
    );
  });

  it('numero digitato: viaggia al server, dove il conflitto ha senso', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup();

    const numero = await screen.findByLabelText<HTMLInputElement>('Numero');
    await user.clear(numero);
    await user.type(numero, '7');
    await scegliArticoloSullaRiga(user);
    await user.click(salvaDocumento());

    expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ number: 7 }));
  });
  it('mostra errori di validazione al submit senza dati obbligatori', async () => {
    const user = userEvent.setup();
    await setup();

    await user.click(salvaDocumento());

    // Il messaggio non ripete più il segnaposto del campo («Seleziona un
    // fornitore…»), che al submit rifiutato si tinge già di rosso: dirlo due
    // volte a quaranta pixel di distanza non aggiungeva niente.
    expect(await screen.findByText('Campo obbligatorio.')).toBeVisible();
  });

  // Prima la testata, come nelle altre due maschere. Qui la ragione non è
  // tecnica — un ordine fornitore non muove giacenze — ma di documento: fra le
  // colonne c'è «Cod. fornitore», e scriverlo prima di aver detto chi è il
  // fornitore è la frase senza il soggetto.
  // Il riordino righe passa dall'avviso, e l'avviso è una volta per documento.
  // Le regole vivono in `domain/` e hanno i loro test: qui si prova che questa
  // maschera le abbia davvero agganciate — l'intestazione è un pulsante, e il
  // primo clic apre l'avviso invece di riordinare.
  // ⛔ Difetto trovato dal proprietario: dopo aver scelto un articolo dai
  // risultati, «Crea articolo» apriva una scheda vestita coi codici di
  // QUELL'articolo — un doppione in attesa di essere salvato. Due guardie: il
  // comando non c'è su riga agganciata, e il precompilato non eredita mai
  // l'identità di un articolo che esiste.
  it('su riga già agganciata il pannello non offre «Crea articolo»', async () => {
    const user = userEvent.setup();
    const { fixture } = await setup();
    await scegliArticoloSullaRiga(user);

    const form = fixture.componentInstance as unknown as {
      openLineProductSearch: (i: number) => void;
      productSearchCanCreate: () => boolean;
    };
    form.openLineProductSearch(0);
    fixture.detectChanges();

    expect(form.productSearchCanCreate()).toBe(false);
    expect(screen.queryByRole('button', { name: 'Crea articolo' })).toBeNull();
  });

  it('su riga libera il pannello offre «Crea articolo»', async () => {
    const user = userEvent.setup();
    const { fixture } = await setup();
    await scegliFornitore(user);

    const form = fixture.componentInstance as unknown as {
      openLineProductSearch: (i: number) => void;
      productSearchCanCreate: () => boolean;
    };
    form.openLineProductSearch(0);
    fixture.detectChanges();

    expect(form.productSearchCanCreate()).toBe(true);
  });

  it('«Crea articolo» non eredita mai l’identità dell’articolo già scelto', async () => {
    const user = userEvent.setup();
    const { fixture } = await setup();
    await scegliArticoloSullaRiga(user);

    const form = fixture.componentInstance as unknown as {
      openProductCreate: (i: number) => void;
      productPanelPrefill: () => { sku?: string; name?: string } | null;
      productPanelEditProductId: () => string | null;
    };
    // Niente `detectChanges`: aprire il pannello renderebbe la scheda prodotto,
    // che qui non ha le sue dipendenze. La prova guarda lo STATO — è lì che il
    // difetto viveva.
    form.openProductCreate(0);

    // Nessun codice dell'articolo esistente nella scheda nuova, e nessuna
    // scheda esistente aperta al posto della creazione.
    expect(form.productPanelPrefill()).toBeNull();
    expect(form.productPanelEditProductId()).toBeNull();
  });

  // ⛔ Da quando il nome è modificabile anche a articolo agganciato (11/08/2026),
  // quel testo è la descrizione di QUESTA riga. Qui si mandava il titolo del
  // catalogo: il documento si riapriva col nome di prima, senza dire niente.
  it('il nome cambiato sulla riga agganciata è quello che va al salvataggio', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup({ vatCodes: [VAT_22] });
    await scegliArticoloSullaRiga(user);

    // L'articolo di prova non ha costo: senza, il salvataggio si ferma prima e
    // il carico utile non parte nemmeno.
    const costo = screen.getByLabelText('Costo riga 1');
    await user.clear(costo);
    await user.type(costo, '12,50');

    const nome = screen.getAllByLabelText('Nome prodotto')[0]!;
    await user.clear(nome);
    await user.type(nome, 'Rosso scuro, seconda scelta');
    await user.click(salvaDocumento());

    // Il finto è dichiarato senza argomenti, quindi TypeScript vede una tupla
    // vuota: si passa da `unknown[]` per leggere ciò che ha davvero ricevuto.
    const inviato = (
      createOrder.mock.calls[0] as unknown as readonly unknown[] | undefined
    )?.[0] as { readonly lines: readonly { readonly description?: string }[] } | undefined;
    expect(inviato?.lines[0]?.description).toBe('Rosso scuro, seconda scelta');
  });

  it('il primo clic sull’intestazione chiede conferma invece di riordinare', async () => {
    const user = userEvent.setup();
    await setup();
    await scegliFornitore(user);

    await user.click(screen.getByRole('button', { name: /^Nome prodotto: ordina/ }));

    expect(await screen.findByText('Riordino righe')).toBeVisible();
    expect(screen.getByText(/non sarà più ricostruibile/)).toBeVisible();
  });

  it('rinunciando non si ordina, e la volta dopo richiede di nuovo', async () => {
    const user = userEvent.setup();
    await setup();
    await scegliFornitore(user);

    await user.click(screen.getByRole('button', { name: /^SKU: ordina/ }));
    await user.click(screen.getByRole('button', { name: 'Annulla' }));

    // L'avviso non è stato consumato: il gesto successivo lo richiede.
    await user.click(screen.getByRole('button', { name: /^SKU: ordina/ }));
    expect(await screen.findByText('Riordino righe')).toBeVisible();
  });

  it('a fornitore mancante le righe non ci sono, e lo stato vuoto dice cosa manca', async () => {
    const user = userEvent.setup();
    await setup();

    expect(screen.queryAllByLabelText('Nome prodotto')).toHaveLength(0);
    expect(screen.getByText('Scegli il fornitore')).toBeVisible();

    await scegliFornitore(user);

    expect(screen.getAllByLabelText('Nome prodotto').length).toBeGreaterThan(0);
    expect(screen.queryByText('Scegli il fornitore')).toBeNull();
  });

  // ⛔ Difetto segnalato dal proprietario: creata per sbaglio la riga sotto e
  // lasciata vuota, il documento non si salvava più — «Riga 2: manca
  // l'articolo» — finché non la si cancellava a mano. La riga vuota in coda la
  // crea la navigazione, non l'operatore: al salvataggio si scarta.
  it('la riga vuota in coda non blocca il salvataggio: si scarta', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup({ vatCodes: [VAT_22] });
    await scegliArticoloSullaRiga(user);
    const costo = screen.getByLabelText('Costo riga 1');
    await user.clear(costo);
    await user.type(costo, '12,50');

    await user.click(screen.getByRole('button', { name: 'Aggiungi riga' }));
    await user.click(salvaDocumento());

    const inviato = (
      createOrder.mock.calls[0] as unknown as readonly unknown[] | undefined
    )?.[0] as { readonly lines: readonly unknown[] } | undefined;
    // Salvato, e con la sola riga compilata.
    expect(inviato?.lines).toHaveLength(1);
  });

  it('consente di aggiungere una riga ordine', async () => {
    const user = userEvent.setup();
    await setup();

    await scegliFornitore(user);

    const rowsBefore = screen.getAllByRole('button', { name: 'Rimuovi riga' }).length;
    await user.click(screen.getByRole('button', { name: 'Aggiungi riga' }));

    expect(screen.getAllByRole('button', { name: 'Rimuovi riga' })).toHaveLength(rowsBefore + 1);
  });

  it('permette lo switch costi netto/ivato dall’intestazione colonna', async () => {
    const user = userEvent.setup();
    await setup();

    await scegliFornitore(user);

    expect(screen.getByText('Costo netto')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Modalità costi del documento' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Usa costi ivati' }));

    expect(screen.getByText('Costo ivato')).toBeVisible();
  });

  it('protegge l’uscita con modifiche non salvate (chip indietro → dialogo)', async () => {
    const user = userEvent.setup();
    await setup();

    await scegliFornitore(user);

    const qtyInput = screen.getByLabelText('Quantità riga 1');
    await user.clear(qtyInput);
    await user.type(qtyInput, '3');

    await user.click(screen.getByRole('button', { name: 'Indietro' }));

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toBeVisible();
    expect(within(dialogo).getByText('Modifiche non salvate')).toBeVisible();

    // ⭐ DUE azioni, e NESSUNA salva. Decisione del proprietario, 24/08/2026:
    // «il procedimento deve essere uguale in tutti i documenti».
    //
    // ⛔ Qui si asserivano «Chiudi senza salvare» e «Salva e chiudi»: tre
    // pulsanti, e un terzo percorso che salvava dal dialogo di uscita. Il
    // salvataggio resta il pulsante Salva della barra.
    expect(
      within(dialogo)
        .getAllByRole('button')
        .map((b) => b.textContent?.trim()),
    ).toEqual(['Annulla', 'Esci senza salvare']);
  });

  it('⭐ salvataggio rifiutato: la riga TORNA, non resti senza dove scrivere', async () => {
    // ⛔ Difetto visto a schermo dal proprietario il 25/08/2026: premuto Ctrl+S
    // su un ordine appena aperto, la riga spariva e compariva un errore —
    // lasciando la maschera spoglia.
    //
    // ⚠️ La causa non e' il salvataggio: `dropTrailingEmptyLines()` toglie le
    // righe vuote PRIMA di validare, e deve farlo, altrimenti la riga seminata
    // all'apertura impedirebbe di salvare un documento vuoto.
    const user = userEvent.setup();
    // ⚠️ NIENTE articolo sulla riga: e' proprio lo scenario visto — documento
    // appena aperto, riga seminata e vuota, che `dropTrailingEmptyLines()`
    // toglie. Riempirla farebbe passare la prova senza provare niente.
    const rendered = await setup({ createFails: true });
    await scegliFornitore(user);

    await user.click(salvaDocumento());
    rendered.fixture.detectChanges();

    const righe = rendered.fixture.componentInstance['lines'];
    expect(righe.length).toBeGreaterThan(0);
  });

  it('senza modifiche il ritorno alla lista non chiede conferma', async () => {
    const user = userEvent.setup();
    await setup();

    await user.click(screen.getByRole('button', { name: 'Indietro' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // ⛔ Difetto misurato il 18/08/2026 confrontando questa maschera con Ordine
  // cliente, Arrivo merce e Corrispettivo manuale: era l'unica delle quattro a
  // mettere una voce vuota in cima all'elenco IVA di riga. Sulla cella a
  // ricerca-e-selezione quella voce è la PRIMA evidenziata — aprire e battere
  // Invio senza guardare azzerava il Codice IVA, e il salvataggio poi rifiutava
  // la riga. Il vuoto non è una scelta dove una riga senza IVA non si salva.
  it('l’elenco del Codice IVA di riga non offre la voce vuota', async () => {
    const user = userEvent.setup();
    await setup({ vatCodes: [VAT_22, VAT_10] });

    await scegliFornitore(user);

    await user.click(screen.getAllByRole('button', { name: 'Apri elenco — Codice IVA riga' })[0]!);

    const voci = screen.getAllByRole('option').map((o) => o.textContent?.trim() ?? '');
    expect(voci.length).toBeGreaterThan(0);
    expect(voci).not.toContain('—');
    expect(voci.every((voce) => voce.length > 0)).toBe(true);
  });

  // Non guarda un difetto: il 18/08/2026 è stato sospettato che cambiare il
  // solo Codice IVA non sporcasse il documento, perché `onLineVatSelect` non
  // chiama `markFormDirty()` mentre i suoi fratelli di riga sì. La misura ha
  // detto il contrario — c'è una sottoscrizione unica su `form.valueChanges`
  // che marca tutto (costruttore, «`this.form.valueChanges…markFormDirty`»), e
  // il `setValue` di quel gestore emette. La protezione c'era già.
  //
  // Resta come guardia di ciò che si è misurato, perché è regredibile in un
  // modo preciso e silenzioso: basta che qualcuno passi quel `setValue` a
  // `{ emitEvent: false }` — come fa `applyFromSummary` due schermate più giù
  // con `quiet` — e l'uscita smette di proteggere senza che nulla diventi
  // rosso.
  //
  // ⚠️ PARTE DA UN ORDINE SALVATO, e non è un giro di scena: scegliere il
  // fornitore sporca già il documento, quindi su un ordine nuovo il dialogo
  // comparirebbe comunque e la prova non misurerebbe l'IVA. Il salvataggio
  // riporta `dirtySinceLastSave` a false, ed è l'unico punto da cui il cambio
  // d'IVA resta l'unica modifica. È anche lo scenario vero: si salva, ci si
  // accorge che l'aliquota è sbagliata, si cambia. (Su un ordine già
  // registrato non si può: quello si apre bloccato, e il dialogo di sblocco
  // non si pilota in jsdom — vedi il TODO sul blocco documenti più sotto.)
  it('dopo il salvataggio, cambiare il solo Codice IVA riprotegge l’uscita', async () => {
    const user = userEvent.setup();
    await setup({ vatCodes: [VAT_22, VAT_10] });

    await scegliFornitore(user);
    await scegliArticoloSullaRiga(user);
    await user.click(salvaDocumento());

    // Salvato: da qui il documento è pulito. Tutto ciò che sporca dopo è il
    // cambio d'IVA, e nient'altro.
    await user.click(screen.getAllByRole('button', { name: 'Apri elenco — Codice IVA riga' })[0]!);
    await user.click(screen.getByRole('option', { name: /^10/ }));

    await user.click(screen.getByRole('button', { name: 'Indietro' }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByText('Modifiche non salvate')).toBeVisible();
  });

  it('mostra errore inline quando il salvataggio fallisce', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup({ createFails: true });

    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));

    await scegliArticoloSullaRiga(user);

    const qtyInput = screen.getByLabelText('Quantità riga 1');
    await user.clear(qtyInput);
    await user.type(qtyInput, '2');
    const costInput = screen.getByLabelText('Costo riga 1');
    await user.clear(costInput);
    await user.type(costInput, '12,50');

    await user.click(salvaDocumento());

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: 'sup-1',
        costEntryMode: 'vat_excluded',
        lines: [
          expect.objectContaining({
            variantId: 'var-1',
            orderedQuantity: 2,
            enteredUnitCostMinor: 1250,
          }),
        ],
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Errore del server');
  });

  // ── Il ciclo del blocco su un ordine già registrato ────────────────────────
  //
  // Apre protetto → si sblocca → si modifica → si salva → torna protetto, senza
  // mai uscire dal documento. È il giro che a mano sembrava a posto due volte
  // mentre non lo era: la prima perché il blocco non si agganciava, la seconda
  // perché non si richiudeva mai dopo il primo sblocco.
  async function setupEdit(status: SupplierOrderStatus = SupplierOrderStatus.Confirmed) {
    const updateOrder = vi.fn(() => of({ id: 'po-1', status: SupplierOrderStatus.Confirmed }));
    const ordine = {
      id: 'po-1',
      reference: 'OF-2026-0001',
      supplierId: 'sup-1',
      supplierName: 'Tessuti Italia',
      status,
      currency: 'EUR',
      costEntryMode: 'vat_excluded' as const,
      orderDate: '2026-08-01T00:00:00.000Z',
      // Documento della controparte con un tipo che NON è più nell'elenco:
      // eliminato dopo che l'ordine era già stato registrato. La dicitura deve
      // restare leggibile, e a tenerla in piedi c'è solo lo snapshot.
      externalDocumentTypeId: 'edt-eliminato',
      externalDocumentTypeSnapshot: 'Nota consegna',
      externalDocNumber: '145',
      externalDocDate: '2026-07-25T00:00:00.000Z',
      lines: [
        {
          id: 'l-1',
          variantId: 'var-1',
          sku: 'MAG-M-ROSSO',
          description: 'Maglietta',
          orderedQuantity: 2,
          receivedQuantity: 0,
          unitCost: { amountMinor: 1250, currencyCode: 'EUR' as const },
          enteredUnitCost: { amountMinor: 1250, currencyCode: 'EUR' as const },
          discountPercent: 0,
          lineTotal: { amountMinor: 2500, currencyCode: 'EUR' as const },
        },
      ],
      subtotal: { amountMinor: 2500, currencyCode: 'EUR' as const },
      tax: { amountMinor: 0, currencyCode: 'EUR' as const },
      totalAmount: { amountMinor: 2500, currencyCode: 'EUR' as const },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };

    await render(SupplierOrderFormComponent, {
      providers: [
        { provide: AuthService, useValue: { currentUser: () => null } },
        provideRouter([{ path: '**', children: [] }]),
        // Serve da quando l'ordine fornitore ha gli allegati: in modifica il
        // pannello costruisce AttachmentsApiService, che legge la config.
        {
          provide: APP_CONFIG,
          useValue: {
            production: false,
            appName: 'VestiFlow',
            apiBaseUrl: '',
            features: { barcodeScanner: false, shopify: false },
          },
        },
        // Rotta /:id/edit: è l'id a far entrare la maschera in modifica.
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: 'po-1' })) },
        },
        {
          provide: SupplierService,
          useValue: { getSuppliers: () => of(SUPPLIERS), createSupplier: vi.fn() },
        },
        { provide: ProductService, useValue: { searchVariantSummaries: () => of(VARIANTS) } },
        {
          provide: SupplierOrderService,
          useValue: {
            getSupplierOrderById: () => of(ordine),
            updateOrder,
            createOrder: vi.fn(),
          },
        },
        {
          provide: DocumentService,
          useValue: {
            getPriceModePreference: () => of(false),
            checkChronology: () => of({ conflicts: [], dismissed: false }),
            dismissChronologyWarning: () => of(void 0),
          },
        },
        { provide: ExternalDocumentTypeService, useValue: { list: () => of(EXTERNAL_DOC_TYPES) } },
        { provide: TableColumnPreferenceService, useValue: tableColumnPreferenceMock() },
        { provide: VatCodeService, useValue: { list: () => of([]) } },
        { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
      ],
    });

    return { updateOrder };
  }

  it('un ordine registrato si apre protetto', async () => {
    await setupEdit();

    expect(await screen.findByRole('button', { name: /Sblocca/ })).toBeVisible();
    // Protetto = form disabilitato: non si digita a vuoto.
    expect(screen.getByLabelText('Quantità riga 1')).toBeDisabled();
  });

  /**
   * ⭐ **La maschera si apre in TUTTI E TRE gli stati** — decisione del
   * proprietario del 27-28/08/2026.
   *
   * ⛔ Qui la maschera faceva `if (order.status !== Confirmed) return 'not-found'`
   * e mostrava «Ordine non modificabile». Il clic di riga su un ordine CONCLUSO
   * — che dal 20/08 punta alla maschera — finiva quindi in un vicolo cieco.
   *
   * ⚠️ **Lo stato dell'Ordine serve ai COLLEGAMENTI documentali**: Confermato è
   * eleggibile in «Includi/Genera», Concluso e Annullato no. Non governa
   * l'apertura, la modifica né il lucchetto — che resta, e vale per ogni stato.
   */
  it.each([
    SupplierOrderStatus.Confirmed,
    SupplierOrderStatus.Concluded,
    SupplierOrderStatus.Cancelled,
  ])('⭐ stato %s: la maschera carica, e nasce protetta', async (status) => {
    await setupEdit(status);

    // Caricata = c'è il documento, non lo stato vuoto «Ordine non modificabile».
    expect(await screen.findByRole('button', { name: /Sblocca/ })).toBeVisible();
    expect(screen.getByLabelText('Quantità riga 1')).toBeDisabled();
  });

  // TODO(blocco documenti): manca il resto del giro — sblocca, modifica, salva,
  // torna protetto. Il test è stato scritto e NON passa nell'ambiente di prova:
  // il dialogo di sblocco usa <dialog>, che jsdom non implementa, e il polyfill
  // qui sopra non basta a farlo arrivare in fondo. Va ripreso decidendo se
  // pilotare il dialogo o esercitare direttamente confirmUnlockEdit(): è la
  // verifica che manca, e va fatta prima di migrare Arrivo merce e Ordine
  // cliente, che hanno lo stesso giro.

  // ── Documento della controparte ────────────────────────────────────────────
  //
  // Tipo, numero e data del documento emesso dal FORNITORE (la sua conferma
  // d'ordine): stanno su ogni maschera documento, non solo sull'Arrivo merce.

  // ── Salvare non è uscire ───────────────────────────────────────────────────
  //
  // Dopo il primo salvataggio si RESTA nel documento: cambia solo l'URL, da
  // /new a /:id/edit, così un ricaricamento non perde il documento e un secondo
  // salvataggio aggiorna invece di crearne un altro. Prima portava al dettaglio
  // in sola lettura, cioè buttava fuori l'operatore da quello che stava
  // scrivendo — ed è lo stesso pattern dell'Ordine cliente.
  it('dopo il salvataggio resta nel documento, su /:id/edit', async () => {
    const user = userEvent.setup();
    await setup({ vatCodes: [VAT_22] });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');

    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));

    await scegliArticoloSullaRiga(user);

    const cost = screen.getByLabelText('Costo riga 1');
    await user.clear(cost);
    await user.type(cost, '12,50');

    await user.click(salvaDocumento());

    expect(navigate).toHaveBeenCalledWith(
      ['/app/orders', 'po-1', 'edit'],
      expect.objectContaining({ replaceUrl: true }),
    );
  });

  // ── Il salvataggio non fallisce mai in silenzio ────────────────────────────
  //
  // Il pulsante marcava i campi e usciva zitto quando il form era invalido:
  // all'operatore non succedeva letteralmente NULLA. E con le colonne che
  // scorrono in orizzontale il campo incriminato può stare fuori schermo,
  // quindi non c'era nemmeno modo di capire da soli cosa mancasse.
  // ⛔ Il costo MANCANTE non blocca più (11/08/2026): un ordine si fa al volo,
  // senza il listino del fornitore sotto mano. Il documento si salva e l'avviso
  // dice quali righe sono partite senza costo. Questo test è la guardia del
  // NUOVO comportamento: prima asseriva il blocco.
  it('senza costo l’ordine si salva, e l’avviso dice quale riga', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup();

    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));

    await scegliArticoloSullaRiga(user);

    // L'articolo di prova non ha costo d'anagrafica: la riga resta senza costo.
    await user.click(salvaDocumento());

    expect(createOrder).toHaveBeenCalled();
    expect(await screen.findByText(/Riga 1: salvata senza costo/)).toBeVisible();
  });

  // Un costo NEGATIVO invece è un valore sbagliato, non un valore assente: resta
  // un blocco, e continua a nominare la riga.
  it('il costo negativo resta un blocco, e dice quale riga', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup();

    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));
    await scegliArticoloSullaRiga(user);

    const costo = screen.getByLabelText('Costo riga 1');
    await user.clear(costo);
    await user.type(costo, '-5,00');
    await user.click(salvaDocumento());

    expect(await screen.findByRole('alert')).toHaveTextContent('Riga 1');
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('senza fornitore lo dice, invece di restare muto', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup();

    await user.click(salvaDocumento());

    expect(await screen.findByRole('alert')).toHaveTextContent('fornitore');
    expect(createOrder).not.toHaveBeenCalled();
  });

  // ── Il selettore netto/ivato cambia la VISTA, non il valore ────────────────
  //
  // Prima non convertiva affatto: cambiava il significato del numero senza
  // cambiare il numero. Lo stesso «5,02» passava da lordo a netto e l'ordine
  // valeva d'improvviso il 22% in meno, senza che nulla si muovesse a schermo.
  //
  // La correzione non è «convertire il valore mostrato» — quella perde il
  // centesimo nel 18% dei costi al 22%. È tenere il netto canonico in memoria e
  // ridisegnare il campo: passando avanti e indietro il numero non si muove
  // perché non viene mai ricostruito da ciò che si vede.
  /**
   * ⚠️ Il campo costo si cerca per ETICHETTA, non per segnaposto: da quando la
   * riga e' comune, «0,00» lo portano anche prezzo di vendita e barrato, e
   * `getByPlaceholderText` prendeva il primo che capitava.
   */
  async function switchCostMode(user: ReturnType<typeof userEvent.setup>, label: string) {
    await user.click(screen.getByRole('button', { name: 'Modalità costi del documento' }));
    await user.click(await screen.findByRole('menuitemradio', { name: label }));
  }

  it('il giro ivato → netto → ivato rimette lo stesso costo ivato', async () => {
    const user = userEvent.setup();
    await setup({ vatCodes: [VAT_22] });

    // Serve un articolo sulla riga: è il richiamo a portarle il Codice IVA, e
    // senza aliquota non c'è nessuno scorporo da fare.
    await scegliArticoloSullaRiga(user);

    await switchCostMode(user, 'Usa costi ivati');

    const cost = screen.getByLabelText('Costo riga 1');
    await user.clear(cost);
    // 5,02 al 22% è uno dei costi che il giro arrotondato perdeva: il netto
    // vale 411,4754 centesimi, e chi lo arrotondava a 411 tornava a 5,01.
    await user.type(cost, '5,02');

    await switchCostMode(user, 'Usa costi netti');
    expect(cost).toHaveValue('4,11');

    await switchCostMode(user, 'Usa costi ivati');
    expect(cost).toHaveValue('5,02');
  });

  it('al salvataggio manda il costo esatto, non i due decimali che si leggono', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup({ vatCodes: [VAT_22] });

    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));

    await scegliArticoloSullaRiga(user);

    await switchCostMode(user, 'Usa costi ivati');
    const cost = screen.getByLabelText('Costo riga 1');
    await user.clear(cost);
    await user.type(cost, '5,02');

    await user.click(salvaDocumento());

    // Il valore parte esatto: è il server a rifare lo scorporo e a ottenere lo
    // stesso netto. Mandare «502» arrotondato funzionerebbe qui e si romperebbe
    // appena l'operatore passa a netto prima di salvare.
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        costEntryMode: 'vat_included',
        lines: [expect.objectContaining({ enteredUnitCostMinor: 502 })],
      }),
    );
  });

  /**
   * Il giro del fuoco, innestato sul punto unico. Chiude tre difetti che questa
   * maschera aveva e le gemelle no.
   */
  describe('il giro del fuoco', () => {
    interface FocusForm {
      readonly lineFocus: {
        fieldsOf: (i: number) => readonly string[];
        rowDown: (i: number, field: string) => void;
      };
      readonly lines: {
        length: number;
        at: (i: number) => { controls: Record<string, { setValue: (v: unknown) => void }> };
      };
      readonly form: { controls: Record<string, { setValue: (v: unknown) => void }> };
    }

    async function apriForm() {
      const { fixture } = await setup({ vatCodes: [VAT_22] });
      return fixture.componentInstance as unknown as FocusForm;
    }

    // «Nome prodotto» era uscito dal giro perché la cella era una tendina e
    // `po-product-{i}` non esisteva in nessun template: da «Cod. fornitore» il
    // fuoco si perdeva a metà strada. Ora la cella è quella condivisa, con un
    // input vero, e il campo è rientrato — la condizione di rientro era questa.
    it('«Nome prodotto» è nel giro, fra i codici e la quantità', async () => {
      const form = await apriForm();

      const giro = form.lineFocus.fieldsOf(0);
      expect(giro).toContain('product');
      expect(giro.indexOf('product')).toBeGreaterThan(giro.indexOf('supplierCode'));
      expect(giro.indexOf('product')).toBeLessThan(giro.indexOf('quantity'));
    });

    // Difetto: U.M. e sconto erano nel giro ma senza gestore di tastiera —
    // due gestori per nove campi. Ora ci sono, e il giro li attraversa.
    it('U.M. e sconto sono attraversabili', async () => {
      const form = await apriForm();

      expect(form.lineFocus.fieldsOf(0)).toEqual(
        expect.arrayContaining(['unitOfMeasure', 'discount']),
      );
    });

    // Difetto: `advanceToNextLine` non guardava la sola-lettura, e questa
    // maschera non ha nemmeno il `<fieldset [disabled]>` delle altre due: su
    // documento bloccato il Tab AGGIUNGEVA righe.
    it('su documento bloccato non si creano righe', async () => {
      const form = await apriForm();
      const righePrima = form.lines.length;
      (form as unknown as { formReadOnly: () => boolean }).formReadOnly = () => true;

      form.lineFocus.rowDown(righePrima - 1, 'quantity');

      expect(form.lines.length).toBe(righePrima);
    });

    // Voce 9 del contratto, che qui NON esisteva: «riga vuota» in Ordine
    // fornitore significa nessun articolo selezionato. Senza, tenere premuto ↓
    // impilerebbe righe vuote in fondo.
    it('↓ in fondo non crea righe se l’articolo non c’è', async () => {
      const form = await apriForm();
      const righePrima = form.lines.length;

      form.lineFocus.rowDown(righePrima - 1, 'quantity');

      expect(form.lines.length).toBe(righePrima);
    });
  });

  /**
   * Conferma di un codice: gli esiti sono TRE, non due.
   *
   * Qui il caso ambiguo è quello che capita davvero. Il codice fornitore non è
   * unico — fornitori diversi possono usare lo stesso codice per articoli
   * diversi — e fino a 08/2026 questa maschera lo risolveva con
   * `resolveVariantIdByCode`, che restituisce `string | null`: due candidati
   * tornavano `null`, cioè il codice giusto si comportava come inesistente.
   */
  describe('conferma dei codici', () => {
    function variante(overrides: Record<string, unknown>) {
      return {
        articleCode: 'ART-1',
        productName: 'Maglietta',
        title: 'Maglietta',
        variantLabel: '',
        sku: 'MAG-M',
        sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
        ...overrides,
      };
    }

    interface CodeForm {
      readonly commitCodeLookup: (index: number, field: string) => void;
      readonly codeLookup: {
        readonly isOpenOn: (index: number, field: string) => boolean;
        readonly matches: () => readonly { readonly variantId: string }[];
      };
      readonly lines: {
        at: (i: number) => {
          controls: Record<string, { setValue: (v: unknown) => void; value: unknown }>;
        };
      };
    }

    /**
     * `catalogo` è cosa risponde la RICERCA (query con `search`): lì il codice
     * fornitore restituito è quello che ha fatto scattare la ricerca.
     * `perVariante` è cosa risponde il caricamento per id, che il form fa dopo
     * per riempire la riga: lì nessuna ricerca ha scelto un collegamento, e il
     * codice restituito è il primo in ordine deterministico — quello di un
     * fornitore qualsiasi. Sono due risposte diverse per lo stesso articolo, ed
     * è da questa differenza che nasce il difetto: mockarle uguali lo nasconde.
     */
    async function apri(
      catalogo: readonly Record<string, unknown>[],
      perVariante?: readonly Record<string, unknown>[],
    ) {
      const { fixture } = await render(SupplierOrderFormComponent, {
        providers: [
          { provide: AuthService, useValue: { currentUser: () => null } },
          provideRouter([{ path: '**', children: [] }]),
          // Serve da quando l'ordine fornitore ha gli allegati: in modifica il
          // pannello costruisce AttachmentsApiService, che legge la config.
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
            provide: SupplierService,
            useValue: { getSuppliers: () => of(SUPPLIERS), createSupplier: vi.fn() },
          },
          {
            provide: ProductService,
            useValue: {
              searchVariantSummaries: (query?: { search?: string }) =>
                of(query?.search ? catalogo : (perVariante ?? catalogo)),
              // L'endpoint per codice tace sui casi ambigui: non deve essere
              // la strada che salva il test.
              findVariantByCode: () => throwError(() => new Error('404')),
            },
          },
          {
            provide: SupplierOrderService,
            useValue: {
              createOrder: vi.fn(),
            },
          },
          {
            provide: DocumentService,
            useValue: {
              getPriceModePreference: () => of(false),
              checkChronology: () => of({ conflicts: [], dismissed: false }),
              dismissChronologyWarning: () => of(void 0),
            },
          },
          { provide: TableColumnPreferenceService, useValue: tableColumnPreferenceMock() },
          { provide: VatCodeService, useValue: { list: () => of([]) } },
          { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
        ],
      });
      return fixture.componentInstance as unknown as CodeForm;
    }

    it('un codice fornitore condiviso da due articoli apre la scelta', async () => {
      const form = await apri([
        variante({ variantId: 'var-1', productId: 'prod-1', supplierSku: 'F-100' }),
        variante({ variantId: 'var-2', productId: 'prod-2', supplierSku: 'F-100' }),
      ]);
      form.lines.at(0).controls['supplierCode']!.setValue('F-100');

      form.commitCodeLookup(0, 'supplierCode');

      expect(form.codeLookup.isOpenOn(0, 'supplierCode')).toBe(true);
      expect(form.codeLookup.matches().map((row) => row.variantId)).toEqual(['var-1', 'var-2']);
    });

    // Il controllo inverso: senza, la prova qui sopra passerebbe anche se la
    // scelta si aprisse sempre, pure con un solo articolo.
    it('un codice fornitore di un solo articolo aggancia la riga', async () => {
      const form = await apri([
        variante({ variantId: 'var-1', productId: 'prod-1', supplierSku: 'F-100' }),
      ]);
      form.lines.at(0).controls['supplierCode']!.setValue('F-100');

      form.commitCodeLookup(0, 'supplierCode');

      expect(form.codeLookup.isOpenOn(0, 'supplierCode')).toBe(false);
      expect(form.lines.at(0).controls['variantId']!.value).toBe('var-1');
    });

    // Il riepilogo porta il codice del PRIMO collegamento in ordine
    // deterministico, che può essere di un altro fornitore: l'operatore
    // digitava F-100 e nel campo si ritrovava F-999, mai scritto da lui.
    it('agganciando da Cod. fornitore resta il codice digitato, non quello del riepilogo', async () => {
      const form = await apri(
        // La ricerca per «F-100» trova l'articolo e riporta il codice che ha
        // corrisposto…
        [variante({ variantId: 'var-1', productId: 'prod-1', supplierSku: 'F-100' })],
        // …ma il caricamento per id, che riempie la riga, riporta il primo
        // collegamento: quello di un altro fornitore.
        [variante({ variantId: 'var-1', productId: 'prod-1', supplierSku: 'F-999' })],
      );
      form.lines.at(0).controls['supplierCode']!.setValue('F-100');

      form.commitCodeLookup(0, 'supplierCode');

      expect(form.lines.at(0).controls['variantId']!.value).toBe('var-1');
      expect(form.lines.at(0).controls['supplierCode']!.value).toBe('F-100');
    });

    // Il controllo inverso del precedente: agganciando per SKU non esiste un
    // «codice con cui hai agganciato», e il campo NON va riempito col codice di
    // un fornitore qualsiasi. Vuoto è la risposta giusta.
    it('agganciando per SKU il Cod. fornitore resta vuoto invece che arbitrario', async () => {
      const form = await apri([
        variante({ variantId: 'var-1', productId: 'prod-1', sku: 'MAG-M', supplierSku: 'F-999' }),
      ]);
      form.lines.at(0).controls['sku']!.setValue('MAG-M');

      form.commitCodeLookup(0, 'sku');

      expect(form.lines.at(0).controls['variantId']!.value).toBe('var-1');
      expect(form.lines.at(0).controls['supplierCode']!.value).toBe('');
    });
  });

  /**
   * ⭐ **L'Ordine fornitore e' il terzo consumer del risolutore comune** (`03c` §5),
   * dopo Trasferimento e Rettifica. E' il primo che porta **denaro** e la
   * **famiglia acquisto**: qui si verifica che «IVA prima del costo» regga come
   * vincolo di contratto e non come commento.
   *
   * ⚠️ **Nessuno di questi test sarebbe diventato rosso prima della migrazione**,
   * ed e' la ragione per cui esistono. Il fixture aveva `productName` non vuoto,
   * quindi il ripiego `productName || title` non veniva mai eseguito; la colonna
   * `variantLabel` non esisteva; e la suite era verde con e senza il difetto.
   */
  describe('il richiamo articolo passa dal risolutore comune', () => {
    it('⛔ il nome non porta la variante, che ha la sua colonna', async () => {
      const user = userEvent.setup();
      await setup();
      await scegliArticoloSullaRiga(user);

      const nome = screen.getAllByLabelText('Nome prodotto')[0] as HTMLInputElement;
      // Il titolo del catalogo e' «Maglietta / M / Rosso»: se il ripiego tornasse,
      // sarebbe QUI che si vedrebbe.
      expect(nome.value).toBe('Maglietta');
      expect(nome.value).not.toContain('/');
    });

    it('la variante arriva al salvataggio nel suo campo, non dentro il nome', async () => {
      const user = userEvent.setup();
      const { createOrder } = await setup();
      await scegliArticoloSullaRiga(user);
      await user.click(salvaDocumento());

      expect(createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({
              // Il nome, e SOLO il nome: il titolo del catalogo dice
              // «Maglietta / M / Rosso», e questo e' il punto in cui il vecchio
              // ripiego lo scriveva nel database.
              description: 'Maglietta',
              variantLabel: 'M / Rosso',
            }),
          ],
        }),
      );
    });

    /**
     * ⚠️ **Il richiamo su riga GIA' AGGANCIATA passa da due soli percorsi**, e
     * i suggerimenti del nome non sono fra questi: `suggestInputs` passa
     * `hasLinked` e su riga agganciata l'elenco non si apre. I due percorsi
     * veri sono la LENTE («Cerca un altro prodotto») e il rientro dal pannello
     * anagrafica — ed e' quest'ultimo il caso in cui il vecchio codice perdeva
     * dati, perche' richiama lo STESSO articolo.
     *
     * Il metodo si chiama direttamente, come gia' fanno i test del pannello
     * qui sopra: il gesto completo misurerebbe il pannello, non il richiamo.
     */
    interface AccessoRichiamo {
      readonly lines: {
        at(i: number): { controls: Record<string, { value: unknown; setValue(v: unknown): void }> };
      };
      onVariantSelect(index: number, value: string | null, linkedWith?: string): void;
    }

    it('⛔ la quantita digitata sopravvive al richiamo dello stesso articolo', async () => {
      const user = userEvent.setup();
      const { fixture } = await setup();
      await scegliArticoloSullaRiga(user);

      const form = fixture.componentInstance as unknown as AccessoRichiamo;
      const riga = form.lines.at(0).controls;
      riga['quantity']!.setValue(7);

      // Lo STESSO articolo, richiamato di nuovo: e' cio' che fa il rientro dal
      // pannello anagrafica. Prima della migrazione la quantita' tornava a 1 e
      // lo sconto si azzerava, su un articolo che non era cambiato.
      form.onVariantSelect(0, 'var-1');
      fixture.detectChanges();

      expect(riga['quantity']!.value).toBe(7);
    });

    it('⛔ lo sconto digitato non viene sovrascritto dal richiamo', async () => {
      const user = userEvent.setup();
      const { fixture } = await setup();
      await scegliArticoloSullaRiga(user);

      const form = fixture.componentInstance as unknown as AccessoRichiamo;
      const riga = form.lines.at(0).controls;
      // A cascata, e la stringa va conservata INTATTA: «4+10» vale 13,6% e non
      // 14, ed e' la stringa che l'operatore rilegge.
      riga['discount']!.setValue('4+10');

      form.onVariantSelect(0, 'var-1');
      fixture.detectChanges();

      expect(riga['discount']!.value).toBe('4+10');
    });

    it('⛔ nome vuoto in anagrafica: la riga resta vuota, non prende il titolo', async () => {
      const user = userEvent.setup();
      const { fixture } = await setup();
      await scegliArticoloSullaRiga(user);

      const form = fixture.componentInstance as unknown as AccessoRichiamo;
      form.onVariantSelect(0, 'var-senza-nome');
      fixture.detectChanges();

      const riga = form.lines.at(0).controls;
      // Il titolo del catalogo e' «Felpa / L / Blu»: ripiegarci sopra
      // scriverebbe la variante dentro il nome. Vuoto e' corretto — dice che
      // l'ANAGRAFICA e' incompleta, e si corregge li'.
      expect(riga['productName']!.value).toBe('');
      expect(riga['productName']!.value).not.toContain('Felpa');
      // …e la variante arriva comunque nella sua colonna.
      expect(riga['variantLabel']!.value).toBe('L / Blu');
    });

    it("la variante si aggiorna quando l'articolo CAMBIA davvero", async () => {
      const user = userEvent.setup();
      const { fixture } = await setup();
      await scegliArticoloSullaRiga(user);

      const form = fixture.componentInstance as unknown as AccessoRichiamo;
      const riga = form.lines.at(0).controls;
      expect(riga['variantLabel']!.value).toBe('M / Rosso');

      // ⛔ Conservare non significa congelare: su un articolo diverso
      // l'etichetta si RICALCOLA. Un `??` al posto del confronto scriverebbe
      // «M» su una riga che ora e' una «L».
      form.onVariantSelect(0, null);
      fixture.detectChanges();

      expect(riga['variantId']!.value).toBe('');
    });
  });

  /**
   * ⭐ **Passo 6B — il campo Stato dell'Ordine fornitore.**
   *
   * Prima di oggi questa maschera non mostrava lo stato affatto: era filtrabile
   * nell'elenco e invisibile nel documento, quindi «Da confermare» sarebbe stato
   * irraggiungibile. È lo STESSO selettore dell'Ordine cliente, dalle stesse
   * `ORDER_STATE_OPTIONS` (`17` §2.1).
   *
   * ⚠️ **Qui si prova la RESA, non il giro completo.** In modifica la maschera
   * nasce protetta e il dialogo di sblocco usa `<dialog>`, che jsdom non
   * implementa (vedi il TODO più sopra): il round-trip salva/riapre dei tre
   * stati è provato sull'API, in `stati-ordini.integration-spec.ts`.
   */
  describe('⭐ stato commerciale dell’Ordine fornitore (6B)', () => {
    it('✅ ordine NUOVO: il selettore c’è e parte da Confermato', async () => {
      await setup({ vatCodes: [VAT_22] });

      const stato = await screen.findByRole('button', { name: 'Stato documento' });
      expect(stato).toHaveTextContent('Confermato');
    });

    it.each([SupplierOrderStatus.Confirmed, SupplierOrderStatus.Cancelled])(
      '✅ stato %s: il selettore resta disponibile',
      async (status) => {
        await setupEdit(status);

        expect(await screen.findByRole('button', { name: 'Stato documento' })).toBeVisible();
      },
    );

    it('⛔ Concluso: lo stato è MOSTRATO ma il selettore non c’è', async () => {
      await setupEdit(SupplierOrderStatus.Concluded);

      // Mostrato: l'etichetta si legge in testata.
      expect(await screen.findByText('Concluso')).toBeVisible();
      // Non modificabile: nessun selettore da cui uscirne.
      expect(screen.queryByRole('button', { name: 'Stato documento' })).toBeNull();
    });

    it('✅ Concluso: il resto del documento resta raggiungibile', async () => {
      await setupEdit(SupplierOrderStatus.Concluded);

      // ⭐ Il lucchetto è sul solo campo Stato: la maschera carica e si sblocca
      //    come per ogni altro stato — non è un vicolo cieco.
      expect(await screen.findByRole('button', { name: /Sblocca/ })).toBeVisible();
      expect(screen.getByLabelText('Quantità riga 1')).toBeInTheDocument();
    });

    /**
     * ⛔ **L'Ordine fornitore non muove quantità, e non deve iniziare adesso.**
     *
     * Nessuna colonna «Impegnata», nessuna «In arrivo»: giacenza e impegni sono
     * dell'Arrivo merce (`17` §1.1, OF-002). Il quarto stato non porta con sé
     * nessun effetto quantitativo.
     */
    it('⛔ nessuna colonna di quantità di magazzino nella griglia righe', async () => {
      await setup({ vatCodes: [VAT_22] });

      expect(screen.queryByRole('columnheader', { name: /Impegnata/i })).toBeNull();
      expect(screen.queryByRole('columnheader', { name: /In arrivo/i })).toBeNull();
      expect(screen.queryByRole('columnheader', { name: /^Imp\.$/ })).toBeNull();
    });
  });
});

/**
 * Il riordino righe passa dall'avviso, e l'avviso è una volta per documento.
 * Le regole vivono in `domain/` e hanno i loro test: qui si prova che questa
 * maschera le abbia davvero agganciate — l'intestazione è un pulsante, il primo
 * clic apre l'avviso invece di riordinare.
 */
