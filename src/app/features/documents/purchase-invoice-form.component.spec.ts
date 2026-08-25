import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import { UserRole } from '@core/models/user.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { ToastService } from '@core/services/toast.service';
import { ViewportService } from '@core/services/viewport.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';

import { PurchaseInvoiceFormComponent } from './purchase-invoice-form.component';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';
import { DocumentSettingsService } from './services/document-settings.service';
import type { SavePurchaseInvoiceBody } from '@domain/documents/services/document-api.mapper';
import type { DocumentCounterView } from '@domain/documents/models/document-counter.model';
import type { ExternalDocumentType } from '@domain/documents/models/external-document-type.model';
import type { LinkableGoodsReceipt } from '@domain/documents/models/goods-receipt-causal.model';

const SUPPLIERS = [{ id: 'sup-1', name: 'ACME Forniture' }];

/** Numerazione predefinita: all'apertura della maschera il primo libero è 42. */
const COUNTER: DocumentCounterView = {
  id: 'cnt-1',
  type: DocumentType.SupplierInvoice,
  series: null,
  locationId: null,
  locationName: null,
  isDefault: true,
  nextNumber: 42,
  documentCount: 41,
};

/** Tipi documento della controparte come li restituisce il seed di sistema. */
const EXTERNAL_TYPES: readonly ExternalDocumentType[] = [
  { id: 'edt-ddt', name: 'DDT', shortLabel: 'DDT', isSystem: true, isActive: true, sortOrder: 0 },
  {
    id: 'edt-fattura',
    name: 'Fattura',
    shortLabel: 'Fatt.',
    isSystem: true,
    isActive: true,
    sortOrder: 1,
  },
];

const RECEIPT_1: LinkableGoodsReceipt = {
  id: 'gr-1',
  number: 1,
  reference: 'DDT-1',
  documentDate: '2026-01-10',
  causalText: 'Acquisto merce',
  subtotal: { amountMinor: 10000, currencyCode: 'EUR' },
  tax: { amountMinor: 2200, currencyCode: 'EUR' },
  total: { amountMinor: 12200, currencyCode: 'EUR' },
  vatBreakdown: [
    {
      ratePercent: 22,
      net: { amountMinor: 10000, currencyCode: 'EUR' },
      vat: { amountMinor: 2200, currencyCode: 'EUR' },
    },
  ],
};

/**
 * Registrazione già salvata: **una riga nata da un arrivo** — con l'importo già
 * corretto a 100,50, che è il caso reale per cui questa unificazione esiste — e
 * **una voce libera**. Serve a provare la RIAPERTURA in modifica.
 */
const REGISTRAZIONE_SALVATA = {
  id: 'pi-1',
  type: DocumentType.SupplierInvoice,
  number: 7,
  documentDate: '2026-01-15',
  supplierId: 'sup-1',
  currency: 'EUR',
  lines: [
    {
      id: 'l-1',
      description: 'Rif. Arrivo merce 1 del 10/01/2026',
      lineTotal: { amountMinor: 10050, currencyCode: 'EUR' },
      lineVatTotal: { amountMinor: 2211, currencyCode: 'EUR' },
      vatSnapshot: { ratePercent: 22 },
      lineSource: 'vat_summary',
      linkedGoodsReceiptId: 'gr-1',
    },
    {
      id: 'l-2',
      description: 'Spese di trasporto',
      lineTotal: { amountMinor: 1500, currencyCode: 'EUR' },
      lineVatTotal: { amountMinor: 330, currencyCode: 'EUR' },
      vatSnapshot: { ratePercent: 22 },
      lineSource: 'manual',
    },
  ],
} as unknown as DocumentRecord;

const RECEIPT_2: LinkableGoodsReceipt = {
  id: 'gr-2',
  number: 2,
  reference: 'DDT-2',
  documentDate: '2026-01-12',
  causalText: 'Acquisto merce',
  subtotal: { amountMinor: 5000, currencyCode: 'EUR' },
  tax: { amountMinor: 1100, currencyCode: 'EUR' },
  total: { amountMinor: 6100, currencyCode: 'EUR' },
  vatBreakdown: [
    {
      ratePercent: 22,
      net: { amountMinor: 5000, currencyCode: 'EUR' },
      vat: { amountMinor: 1100, currencyCode: 'EUR' },
    },
  ],
};

/** Operatore non titolare: conta solo l'elenco permessi, mai il ruolo. */
function clerkWith(permissions: readonly TenantPermissionKey[]) {
  return { role: UserRole.Clerk, permissions: [...permissions] };
}

describe('PurchaseInvoiceFormComponent', () => {
  interface SetupOptions {
    /** Contatori restituiti da GET /document-counters: alimentano la proposta. */
    readonly counters?: readonly DocumentCounterView[];
    /** Numero che il server assegna davvero al salvataggio. */
    readonly assignedNumber?: number;
    /**
     * Permessi dell'operatore. Ometterli non è «tutto concesso»: vale come
     * nessun utente in sessione, quindi elenco effettivo vuoto. Li dichiara
     * solo chi sta provando un comando che i permessi governano.
     */
    readonly permissions?: readonly TenantPermissionKey[];
    /**
     * Vista compatta (pannelli apribili) invece della griglia di scrivania.
     * Senza il foglio globale la soglia non è leggibile e il servizio vero
     * resta sulla vista estesa: la vista compatta si chiede.
     */
    readonly compatta?: boolean;
    /**
     * Registrazione già salvata da riaprire in modifica. Senza, la maschera è
     * un documento nuovo — ed è lo scenario di quasi tutte le prove qui.
     */
    readonly documentoDaRiaprire?: DocumentRecord;
  }

  async function setup(options: SetupOptions = {}) {
    const counters = options.counters ?? [];
    const showInfo = vi.fn();
    const documentService = {
      // Controllo cronologico (§4): serie in ordine, nessun avviso.
      checkChronology: () => of({ conflicts: [], dismissed: false }),
      dismissChronologyWarning: () => of(void 0),
      getDocumentById: vi.fn(() =>
        options.documentoDaRiaprire ? of(options.documentoDaRiaprire) : of(undefined),
      ),
      listLinkableGoodsReceipts: vi.fn(() => of([RECEIPT_1, RECEIPT_2])),
      // Della registrazione salvata la maschera legge solo il numero assegnato:
      // è il confronto con quello mostrato che decide se avvisare l'operatore.
      savePurchaseInvoice: vi.fn((_body: SavePurchaseInvoiceBody) =>
        of({
          document: {
            id: 'pi-1',
            number: options.assignedNumber ?? 1,
          } as unknown as DocumentRecord,
          receiptsTotalMinor: 0,
          totalsMatch: true,
        }),
      ),
    };

    const view = await render(PurchaseInvoiceFormComponent, {
      providers: [
        {
          provide: DocumentCountersService,
          useValue: {
            available: () => of({ counters, proposedCounterId: counters[0]?.id ?? null }),
          },
        },
        // Dei permessi questa maschera ne guarda uno solo, «documents.configure»,
        // che apre la gestione delle numerazioni: senza utente in sessione il
        // comando non c'è, ed è lo scenario della gran parte dei test qui sotto.
        {
          provide: AuthService,
          useValue: {
            currentUser: () => (options.permissions ? clerkWith(options.permissions) : null),
          },
        },
        // Rotta jolly: dopo il salvataggio la maschera torna all'elenco, e una
        // navigazione senza rotte da agganciare fallirebbe in modo rumoroso.
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: ActivatedRoute,
          useValue: {
            // `queryParamMap` serve davvero: la maschera lo legge in
            // `afterNextRender` per il precompilato da «Duplica documento», e
            // senza, l'eccezione interrompe il blocco — portandosi via anche i
            // passi successivi, fra cui la proposta del tipo controparte.
            snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
            paramMap: of(
              convertToParamMap(
                options.documentoDaRiaprire ? { id: options.documentoDaRiaprire.id } : {},
              ),
            ),
            queryParamMap: of(convertToParamMap({})),
          },
        },
        {
          provide: SupplierService,
          useValue: { getSuppliers: () => of(SUPPLIERS) },
        },
        {
          provide: PaymentOptionsService,
          useValue: { list: () => of([]) },
        },
        { provide: DocumentService, useValue: documentService },
        // Tipi del documento della controparte: li chiedono sia la testata
        // (componente condiviso) sia la proposta «Fattura» sui documenti nuovi.
        {
          provide: ExternalDocumentTypeService,
          useValue: { list: () => of(EXTERNAL_TYPES) },
        },
        // Serie del numero: una sola configurata → label statica.
        {
          provide: DocumentSettingsService,
          useValue: { getSettings: () => of([]) },
        },
        { provide: ToastService, useValue: { showInfo, showError: vi.fn() } },
        {
          provide: ViewportService,
          useValue: { compact: () => options.compatta === true },
        },
      ],
    });

    // ⚠️ Il risultato del render serve a chi deve guardare il FORM, non solo il
    // DOM: spostare un campo e scollegarlo dal suo controllo da' lo stesso
    // risultato a occhio, e senza il `fixture` non si distinguono.
    return { ...view, documentService, showInfo };
  }

  /**
   * ⛔ Qui si prendeva il PRIMO di tanti — «il campo Numero vive in due viste
   * (mobile + desktop)» — e la doppia scrittura della testata era così
   * diventata un requisito del test. Ora il campo è dichiarato una volta:
   * `findBy` fallisce se ne ricompare un secondo, ed è la guardia che tiene.
   */
  async function numberInput(): Promise<HTMLInputElement> {
    return screen.findByLabelText<HTMLInputElement>('Numero');
  }

  async function saveInvoice(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getAllByRole('button', { name: 'Salva documento' })[0]!);
  }

  async function selectSupplier(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'ACME Forniture' }));
  }

  async function includeReceipt(user: ReturnType<typeof userEvent.setup>, index: number) {
    await user.click(screen.getByRole('button', { name: /Includi arrivo merce/i }));
    const checkboxes = await screen.findAllByRole('checkbox');
    await user.click(checkboxes[index]!);
    await user.click(screen.getByRole('button', { name: 'Includi selezionati' }));
  }

  /**
   * ⭐ **Includere un arrivo MATERIALIZZA le sue righe: da lì sono modificabili.**
   *
   * ⛔ Qui si provava l'opposto — «raggruppa gli arrivi inclusi in righe per
   * aliquota»: le righe da arrivo erano generate, in sola lettura, e due arrivi
   * con la stessa aliquota finivano SOMMATI in una riga sola.
   *
   * ⚠️ Quel raggruppamento era il difetto, non una comodità: una fattura
   * fornitore quasi mai coincide al centesimo con la somma degli arrivi, e la
   * parte non correggibile era proprio quella. Ora ogni arrivo porta le sue
   * righe, e la riga si corregge come tutte le altre.
   */
  it('⭐ includere un arrivo porta le sue righe, e restano MODIFICABILI', async () => {
    const user = userEvent.setup();
    await setup();

    await selectSupplier(user);
    await includeReceipt(user, 0);

    const descrizione = screen.getByLabelText<HTMLInputElement>('Descrizione riga 2');
    expect(descrizione.value).toBe('Rif. Arrivo merce 1 del 10/01/2026');

    // ⭐ E si corregge: era un `<td>` di testo, ora è un campo.
    const netto = screen.getByLabelText<HTMLInputElement>('Importo netto riga 2');
    expect(netto.value).toBe('100,00');
    await user.clear(netto);
    await user.type(netto, '100,50');
    expect(screen.getByLabelText<HTMLInputElement>('Importo netto riga 2').value).toBe('100,50');
  });

  it('⛔ due arrivi danno DUE righe, non una riga sommata', async () => {
    // ⚠️ La riga porta il legame con UN arrivo. Sommarne due nella stessa riga
    // perderebbe il legame di uno dei due — e cancellare quella riga
    // scollegherebbe entrambi.
    const user = userEvent.setup();
    await setup();

    await selectSupplier(user);
    await includeReceipt(user, 0);
    await includeReceipt(user, 0);

    expect(screen.getByLabelText<HTMLInputElement>('Descrizione riga 2').value).toBe(
      'Rif. Arrivo merce 1 del 10/01/2026',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Descrizione riga 3').value).toBe(
      'Rif. Arrivo merce 2 del 12/01/2026',
    );
  });

  // Una riga calcola l'importo IVA da netto × aliquota; il valore resta
  // comunque modificabile dall'operatore.
  it('calcola l’IVA della riga da importo netto e aliquota', async () => {
    const user = userEvent.setup();
    await setup();

    // ⭐ Nessun «Aggiungi riga»: la riga 1 c'è già all'apertura, come su ogni
    // altra maschera documentale.
    await user.type(screen.getByLabelText('Importo netto riga 1'), '100');
    await user.type(screen.getByLabelText('Aliquota IVA riga 1'), '22');

    const vatInput = screen.getByLabelText<HTMLInputElement>('Importo IVA riga 1');
    expect(vatInput.value).toBe('22,00');
  });

  /**
   * ⭐ **Riaprire una registrazione riporta TUTTE le sue righe.**
   *
   * ⛔ **La prova che mancava, ed era la più pericolosa.** Il caricamento aveva
   * `if (line.lineSource !== 'manual') continue;`: scartava ogni riga che non
   * fosse una voce libera, perché quelle da arrivo il client se le ri-derivava.
   *
   * ⚠️ Con le righe materializzate quel filtro sarebbe stato **distruttivo, in
   * tre tempi**: la riga da arrivo non entrava nel form, quindi non entrava nel
   * payload, quindi il `deleteMany` del server la cancellava per sempre. Il
   * documento si sarebbe svuotato in silenzio, e nessun test lo vedeva —
   * perché nessun test riapriva una registrazione con righe da arrivo.
   */
  it('⭐ riaprendo una registrazione tornano ANCHE le righe nate da un arrivo', async () => {
    await setup({ documentoDaRiaprire: REGISTRAZIONE_SALVATA });

    const daArrivo = await screen.findByLabelText<HTMLInputElement>('Descrizione riga 1');
    expect(daArrivo.value).toBe('Rif. Arrivo merce 1 del 10/01/2026');
    expect(screen.getByLabelText<HTMLInputElement>('Importo netto riga 1').value).toBe('100,50');

    const libera = screen.getByLabelText<HTMLInputElement>('Descrizione riga 2');
    expect(libera.value).toBe('Spese di trasporto');
  });

  it('⭐ e il legame all’arrivo torna con la riga, non da un elenco a parte', async () => {
    // ⚠️ Se il legame non tornasse, il salvataggio successivo scollegherebbe
    // l'arrivo senza che nessuno l'abbia chiesto — e l'arrivo tornerebbe
    // «Sospeso», cioè di nuovo da fatturare.
    const user = userEvent.setup();
    const { documentService } = await setup({ documentoDaRiaprire: REGISTRAZIONE_SALVATA });
    await screen.findByLabelText('Descrizione riga 1');

    await saveInvoice(user);

    await waitFor(() => expect(documentService.savePurchaseInvoice).toHaveBeenCalled());
    const body = documentService.savePurchaseInvoice.mock.calls[0]![0];
    expect(body.lines?.[0]?.linkedGoodsReceiptId).toBe('gr-1');
    expect(body.lines?.[1]?.linkedGoodsReceiptId).toBeUndefined();
  });

  /**
   * ⭐ **LA RETE.** Riaprire e risalvare senza toccare niente non deve cambiare
   * un centesimo.
   *
   * ⚠️ **Oggi è verde, ed è il punto.** Non prova un difetto: prova che i valori
   * economici sopravvivono al giro completo — form → payload — ed è la rete che
   * rende sicuri i passi che convertono questa maschera alla primitiva monetaria
   * e al Codice IVA. Diventa rossa nel momento in cui uno di quei passi azzera
   * l'imposta di un documento già salvato, che è il difetto più costoso
   * possibile qui: cambierebbe il totale e il residuo da pagare.
   *
   * ⛔ È anche la regola «la riga di un documento è una fotografia e non si
   * riscatta da sola» (`regole-gestionale`), applicata dove non era provata.
   */
  it('⭐ risalvare senza toccare NIENTE riporta gli stessi importi, al centesimo', async () => {
    const user = userEvent.setup();
    const { documentService } = await setup({ documentoDaRiaprire: REGISTRAZIONE_SALVATA });
    await screen.findByLabelText('Descrizione riga 1');

    await saveInvoice(user);

    await waitFor(() => expect(documentService.savePurchaseInvoice).toHaveBeenCalled());
    const body = documentService.savePurchaseInvoice.mock.calls[0]![0];

    // I valori sono quelli di REGISTRAZIONE_SALVATA, non ricalcolati né arrotondati.
    expect(body.lines).toEqual([
      {
        description: 'Rif. Arrivo merce 1 del 10/01/2026',
        netMinor: 10_050,
        vatRatePercent: 22,
        vatMinor: 2_211,
        linkedGoodsReceiptId: 'gr-1',
      },
      {
        description: 'Spese di trasporto',
        netMinor: 1_500,
        vatRatePercent: 22,
        vatMinor: 330,
        linkedGoodsReceiptId: undefined,
      },
    ]);
  });

  it('⭐ e i totali a schermo sono la somma delle righe, non un dato a parte', async () => {
    // ⚠️ Se un passo futuro spostasse i totali su un campo persistito, questa
    // diventerebbe rossa — ed è l'avviso giusto: i totali di questa maschera si
    // calcolano dalle righe, e l'operatore li vede aggiornarsi mentre digita.
    await setup({ documentoDaRiaprire: REGISTRAZIONE_SALVATA });
    await screen.findByLabelText('Descrizione riga 1');

    // 100,50 + 15,00 = 115,50 · 22,11 + 3,30 = 25,41 · totale 140,91
    expect(screen.getByText('115,50 €')).toBeTruthy();
    expect(screen.getByText('25,41 €')).toBeTruthy();
    expect(screen.getByText('140,91 €')).toBeTruthy();
  });

  // Le scadenze si precompilano con il residuo non coperto; la spunta
  // "Saldato" propone oggi come data saldo (spec PAGAMENTO).
  it('precompila la scadenza con il residuo e la data saldo alla spunta Saldato', async () => {
    const user = userEvent.setup();
    await setup();

    await selectSupplier(user);
    await includeReceipt(user, 0);

    await user.click(screen.getByRole('button', { name: /Aggiungi scadenza/i }));
    const amountInput = screen.getByLabelText<HTMLInputElement>('Importo scadenza 1');
    expect(amountInput.value).toBe('122,00');

    await user.click(screen.getByLabelText('Scadenza 1 saldata'));
    const settledDate = screen.getByLabelText<HTMLInputElement>('Data saldo scadenza 1');
    expect(settledDate.value).not.toBe('');
  });

  // Senza «documents.configure» l'ingranaggio accanto alla serie non compare:
  // l'API nega la scrittura delle numerazioni, il comando risponderebbe 403.
  it('nasconde «Gestisci numerazioni» a chi non configura i documenti', async () => {
    await setup({ permissions: [] });

    expect(screen.queryByRole('button', { name: 'Gestisci numerazioni' })).toBeNull();
  });

  // ── La testata ha UNA veste viva, e sono due ────────────────────────────
  //
  // Le due scritture non convivono più nel DOM: sotto la soglia c'è il
  // pannello apribile, sopra la griglia. La prova serve perché in jsdom la
  // soglia non è leggibile e ogni altro test gira sulla vista estesa: senza,
  // la veste compatta non la eseguirebbe nessuno.
  it('sulla vista compatta monta i pannelli, e il campo Numero resta uno', async () => {
    await setup({ compatta: true });

    // Il secondo pannello resta della maschera: la testata comune ne rende uno.
    expect(await screen.findByText('Registrazione VestiFlow')).toBeTruthy();
    // Un campo, un identificativo: se tornasse la seconda scrittura qui ce ne
    // sarebbero due, e `findBy` fallirebbe.
    expect(await screen.findByLabelText('Numero')).toBeTruthy();
    expect(screen.getByLabelText('Commento interno')).toBeTruthy();
    // Il documento del fornitore cambia VESTE con la larghezza (fascia
    // secondaria di là, sezione del pannello di qua) ma resta dichiarato una
    // volta: qui si prova che nella veste compatta c’è davvero.
    expect(screen.getByLabelText('N. fattura')).toBeTruthy();
  });

  // ── La prova di falsificazione del guscio comune ─────────────────────────
  //
  // ⭐ Questa maschera e' il caso piu' severo, e non per caso: ha righe
  // ECONOMICHE — nessun articolo, nessuna variante, nessun magazzino — e nessuna
  // griglia articoli. Se il livello comune fosse «il guscio dei documenti con
  // prodotti», qui si romperebbe.
  //
  // ⛔ Il criterio non e' che funzioni: e' che funzioni SENZA che il livello
  // comune sappia di stare mostrando una registrazione fattura.
  // `check-document-grammar` verifica l'altro lato — nessun componente del
  // motore documenti nomina un tipo documento — e gira dentro `npm run lint`.
  it('⭐ monta i pezzi comuni con righe economiche e ZERO griglie articoli', async () => {
    const { container } = await setup();

    for (const pezzo of [
      'app-document-prefill-error',
      'app-document-header',
      'app-document-notes',
      'app-document-totals',
      'app-document-actions',
    ]) {
      expect(container.querySelector(pezzo), pezzo).not.toBeNull();
    }

    // ⚠️ E la meta' che rende severa la prova: nessuna riga articolo.
    expect(container.querySelector('app-document-line')).toBeNull();
    expect(container.querySelector('.doc-form__table-wrap')).toBeNull();
  });

  it('⭐ il Commento interno sta nell’area NOTE, e scrive ancora sullo stesso controllo', async () => {
    // ⛔ Stava in TESTATA. Spostato nel piede il 25/08/2026 (proprietario): non
    // e' un dato identificativo come Fornitore, Serie o N. fattura — e' una
    // nota. ⭐ Stesso `formControlName`, nessuna modifica ai dati: la prova
    // guarda entrambe le cose, perche' spostare un campo e SCOLLEGARLO da' lo
    // stesso risultato a occhio.
    const user = userEvent.setup();
    const { fixture } = await setup();

    const campo = screen.getByLabelText('Commento interno');
    expect(campo.closest('.doc-form__footer-notes')).not.toBeNull();
    expect(campo.closest('.doc-form__header')).toBeNull();

    await user.type(campo, 'da richiamare');

    expect(fixture.componentInstance.form.controls.internalComment.value).toBe('da richiamare');
  });

  it('mostra «Gestisci numerazioni» a chi ha documents.configure', async () => {
    await setup({ permissions: [TenantPermission.DocumentsConfigure] });

    // ⛔ Qui si contava «almeno uno», perché testata mobile e griglia desktop
    // montavano entrambe il campo. La testata si dichiara una volta e ne rende
    // una sola veste: il comando è UNO, e `getByRole` fallisce se tornano due.
    expect(screen.getByRole('button', { name: 'Gestisci numerazioni' })).toBeTruthy();
  });

  // ── Il numero proposto non torna al server come imposizione ─────────────
  //
  // Il numero che la maschera mostra all'apertura è il primo libero: una
  // proposta, non una scelta. Rimandarlo al salvataggio lo trasformava in
  // un'imposizione, e il secondo operatore si prendeva un dialogo di conflitto
  // per un numero che non aveva mai digitato — glielo aveva scritto la maschera.
  it('non manda il numero proposto: lo assegna il server', async () => {
    const user = userEvent.setup();
    const { documentService, showInfo } = await setup({
      counters: [COUNTER],
      assignedNumber: 42,
    });

    const numero = await numberInput();
    await waitFor(() => expect(numero.value).toBe('42'));

    await selectSupplier(user);
    await saveInvoice(user);

    expect(documentService.savePurchaseInvoice.mock.calls[0]![0].number).toBeUndefined();
    // Il server ha confermato il 42: non c'è nulla da segnalare all'operatore.
    expect(showInfo).not.toHaveBeenCalled();
  });

  // Il numero digitato a mano resta una scelta dell'operatore, e va difesa: si
  // manda, e se è occupato il dialogo di conflitto ha qualcosa da dire.
  it('manda il numero digitato dall’operatore', async () => {
    const user = userEvent.setup();
    const { documentService } = await setup();

    await user.type(await numberInput(), '77');

    await selectSupplier(user);
    await saveInvoice(user);

    expect(documentService.savePurchaseInvoice.mock.calls[0]![0].number).toBe(77);
  });

  // Numero proposto e numero assegnato possono divergere: fra l'apertura e il
  // salvataggio un altro operatore può aver preso il 42. Non è un errore, ma
  // chi l'aveva già trascritto su carta deve sapere di avere il numero sbagliato.
  it('avvisa quando il server assegna un numero diverso da quello proposto', async () => {
    const user = userEvent.setup();
    const { showInfo } = await setup({ counters: [COUNTER], assignedNumber: 46 });

    const numero = await numberInput();
    await waitFor(() => expect(numero.value).toBe('42'));

    await selectSupplier(user);
    await saveInvoice(user);

    expect(showInfo).toHaveBeenCalledWith(
      'Salvato con il n. 46: il 42 è stato preso da un altro operatore.',
    );
  });
});
