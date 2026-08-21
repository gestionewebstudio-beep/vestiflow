import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import {
  creationIntentErrorOf,
  creationIntentStillHeld,
} from '@core/models/creation-intent-error.util';
import { customerDisplayName, type Customer } from '@core/models/customer.model';
import { LocationContextService } from '@core/services/location-context.service';
import { CustomerService } from '@domain/customers/services/customer.service';
import { DocumentMobilePanelComponent } from '@domain/documents/components/document-mobile-panel/document-mobile-panel.component';
import { DocumentService } from '@domain/documents/services/document.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import {
  storeSaleLineFromDocumentLine,
  storeReturnLinePayload,
  storeSaleLinePayload,
  type StoreSaleDocumentLine,
} from '@domain/store-sales/models/store-sale-document-line.model';
import { storeSaleModeDescriptor } from '@domain/store-sales/models/store-sale-mode.descriptor';
import {
  requireStoreSaleMode,
  STORE_SALE_ROOT_PATH,
  storeSaleModeOfDocumentType,
} from '@domain/store-sales/models/store-sale-routing.util';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import type { DocumentRecord } from '@core/models/document.model';
import type {
  CreateStoreReturnPayload,
  CreateStoreSalePayload,
  StoreSaleResult,
} from '@domain/store-sales/models/store-sale.model';
import { StoreSalesService } from './services/store-sales.service';

/** I quattro stati del caricamento, come nelle altre sei maschere. */
type LoadState = 'ready' | 'loading' | 'not-found' | 'error';

/**
 * I campi di testata che questa fase **conserva senza ancora mostrarli**.
 *
 * ⛔ Non sono un ripiego: il server riscrive la testata da quello che riceve —
 * `notes: dto.notes?.trim() || null`, e lo stesso per la causale. Ometterli
 * risalvando un documento esistente li **cancellerebbe**. Qui si caricano dal
 * documento e si rimandano tali e quali; i loro campi arrivano col piede.
 *
 * ⛔ **Il PAGAMENTO non sta qui, e non è una svista** (`11` A8): la sua
 * gestione è differita al blocco Pagamenti/Tesoreria, quindi questa maschera
 * non lo tocca in nessun modo — né campo, né valore, né trasporto. Il dato
 * storico lo protegge il server, che senza `paymentMethod` dichiarato conserva
 * quello persistito.
 */
interface PreservedHeader {
  readonly notes: string;
  readonly causale: string;
}

const PRESERVED_HEADER_VUOTA: PreservedHeader = {
  notes: '',
  causale: '',
};

function oggiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * La maschera **nuova** di Vendita e Reso al banco: un documento VestiFlow, non
 * una cassa con un carrello (`11`).
 *
 * ⛔ **Non è ancora montata su nessuna rotta**, e la decisione è del
 * proprietario (21/08/2026): le quattro rotte operative restano su
 * `StoreSaleRegisterComponent` finché questa maschera non ha almeno testata e
 * area righe, cioè finché non è realmente utilizzabile. Fino ad allora si
 * verifica con i test, e non si espone una maschera a metà.
 *
 * **Che cosa c'è, in questa prima fase:**
 *
 * ```text
 * modo dalla ROTTA · descrittore · UN modello di riga · UNA collezione
 * testata: sede · cliente (facoltativo, entrambi i modi) · data
 * gate della testata + stato vuoto al posto delle righe
 * caricamento per id, salvataggio create/update, intento di creazione (T15)
 * ```
 *
 * **Che cosa NON c'è ancora**, e va saputo prima di montarla:
 *
 * | manca                        | arriva con                       |
 * | ---------------------------- | -------------------------------- |
 * | griglia righe e ricerca      | il blocco righe                  |
 * | Numero/Serie in testata      | T8B, col giro dei contatori      |
 * | netto/ivato                  | il blocco prezzo                 |
 * | piede: totali, note, azioni  | il blocco piede                  |
 * | `canDeactivate` e il dialogo | il piede, insieme alle azioni    |
 *
 * ⚠️ Finché `canDeactivate` non c'è, `unsavedChangesGuard` lascia uscire senza
 * chiedere (per costruzione: usa l'optional chaining). Va scritto **nello
 * stesso passo** che monta le rotte, o si esce da un documento aperto senza che
 * nessuno lo chieda.
 */
@Component({
  selector: 'app-store-sale-document-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BackButtonComponent,
    DateInputComponent,
    DocumentMobilePanelComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    InlineBannerComponent,
    SelectMenuComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './store-sale-document-form.component.html',
  styleUrl: './store-sale-document-form.component.scss',
})
export class StoreSaleDocumentFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(StoreSalesService);
  private readonly documents = inject(DocumentService);
  private readonly customerService = inject(CustomerService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly locationContext = inject(LocationContextService);

  /**
   * Vendita o Reso, e lo decide la **rotta**.
   *
   * ⛔ Nessun valore predefinito: `requireStoreSaleMode` lancia se la rotta non
   * lo dichiara. I due modi hanno effetti di magazzino opposti, e un fallback
   * su `sale` farebbe compilare una vendita a chi ha aperto «Nuovo reso al
   * banco», senza che niente lo segnali.
   *
   * ⚠️ È un valore fisso, non un signal: le due rotte di creazione sono voci
   * distinte, quindi il componente viene distrutto e ricreato passando dall'una
   * all'altra. Non esiste il caso «stessa istanza, modo nuovo».
   */
  private readonly mode = requireStoreSaleMode(this.route.snapshot.data);

  /** Tutte le differenze fra i due modi, dichiarate in un posto solo. */
  protected readonly descriptor = storeSaleModeDescriptor(this.mode);

  // ── Caricamento di un documento esistente ───────────────────────────────
  //
  // È il pattern comune delle altre maschere: `paramMap` (mai `snapshot`, il
  // router riusa l'istanza passando da un documento all'altro), un `loadTick`
  // per il «riprova», e quattro stati letti dal template.

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });

  /** L'id del documento da modificare, o `null` se se ne sta creando uno. */
  protected readonly editDocumentId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editDocumentId()));

  protected readonly pageTitle = computed(() =>
    this.isEditMode() ? this.descriptor.editTitle : this.descriptor.createTitle,
  );

  private readonly loadTick = signal(0);

  private readonly loadState = toSignal(
    toObservable(computed(() => ({ id: this.editDocumentId(), tick: this.loadTick() }))).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<LoadState>('ready');
        }
        return this.documents.getDocumentById(id).pipe(
          map((doc): LoadState => {
            // ⚠️ Il tipo lo dice la ROTTA, non il documento: se non coincidono
            // l'indirizzo è sbagliato, e mostrarlo comunque farebbe correggere
            // un reso su una maschera che dice vendita.
            if (storeSaleModeOfDocumentType(doc.type) !== this.mode) {
              return 'not-found';
            }
            this.patchFromDocument(doc);
            return 'ready';
          }),
          startWith<LoadState>('loading'),
          catchError(() => of<LoadState>('error')),
        );
      }),
    ),
    { initialValue: this.editDocumentId() ? 'loading' : 'ready' },
  );

  protected readonly loading = computed(() => this.loadState() === 'loading');
  protected readonly loadError = computed(() => this.loadState() === 'error');
  protected readonly notEditable = computed(() => this.loadState() === 'not-found');

  protected reload(): void {
    this.loadTick.update((tick) => tick + 1);
  }

  /** Ritorno all'elenco dallo stato «non disponibile». */
  protected goToList(): void {
    void this.router.navigateByUrl(STORE_SALE_ROOT_PATH);
  }

  // ── Testata ─────────────────────────────────────────────────────────────

  readonly form = this.fb.group({
    locationId: this.fb.control('', { validators: [Validators.required] }),
    /** Facoltativo, e solo sulla Vendita: il contratto del Reso non lo prevede. */
    customerId: this.fb.control(''),
    documentDate: this.fb.control(oggiIso(), { validators: [Validators.required] }),
  });

  // Snapshot reattivo del form: i computed qui sotto leggono i FormControl, che
  // non sono signal — senza questa dipendenza resterebbero memoizzati.
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /**
   * I campi di testata che questa fase conserva senza mostrarli. Vedi
   * `PreservedHeader`: non mandarli al risalvataggio li cancellerebbe.
   */
  private readonly preserved = signal<PreservedHeader>(PRESERVED_HEADER_VUOTA);

  /**
   * Le righe del documento. **Una collezione sola**, per Vendita e Reso.
   *
   * In questa fase si popolano solo caricando un documento esistente e si
   * rimandano intatte al salvataggio: la griglia e l'inserimento arrivano col
   * blocco righe.
   */
  protected readonly lines = signal<readonly StoreSaleDocumentLine[]>([]);

  protected readonly locationOptions = computed((): readonly SelectMenuOption[] =>
    this.operationalLocations.actionLocations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  /**
   * La sede **precompila, e resta un normale controllo comune** (`11` A13).
   *
   * ⛔ Una sola sede disponibile non cambia la natura del campo: la maschera
   * legacy in quel caso mostrava un'etichetta al posto della tendina, e
   * portarsela dietro avrebbe fatto di un default una regola funzionale
   * diversa. Il default riempie; cambiarlo resta possibile, e l'autorizzazione
   * la fa il server (T6).
   *
   * ⛔ **In modifica non scrive niente**: vince la sede persistita sul
   * documento. Sovrascriverla con la sede corrente lo sposterebbe di magazzino
   * aprendolo, e un cambio dev'essere esplicito.
   */
  private readonly precompilaSedePredefinita = effect(() => {
    if (this.isEditMode() || this.form.controls.locationId.value) {
      return;
    }
    const preferita = this.locationContext.activeLocationId();
    const disponibili = this.operationalLocations.actionLocations();
    const scelta =
      disponibili.find((loc) => loc.id === preferita)?.id ??
      (disponibili.length === 1 ? disponibili[0]!.id : null);
    if (!scelta) {
      return;
    }
    this.form.controls.locationId.setValue(scelta);
  });

  // Il cliente è facoltativo e sta nella testata di ENTRAMBI i modi (`11` A13):
  // l'elenco si carica allo stesso modo su Vendita e Reso.
  private readonly customers = toSignal(
    this.customerService.getAllCustomers().pipe(catchError(() => of([] as readonly Customer[]))),
    { initialValue: [] as readonly Customer[] },
  );

  protected readonly customerOptions = computed((): readonly SelectMenuOption[] =>
    this.customers().map((customer) => ({
      value: customer.id,
      label: customerDisplayName(customer),
    })),
  );

  /**
   * Il cambio di sede è **esplicito**: lo fa l'operatore, e da lì in poi il
   * valore è una scelta. L'autorizzazione la verifica il server su entrambe le
   * sedi, quella del documento e quella richiesta (T6).
   */
  protected onLocationChange(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? '');
    this.form.controls.locationId.markAsDirty();
    this.locationContext.setActiveLocation(value);
  }

  protected onCustomerChange(value: string | null): void {
    this.form.controls.customerId.setValue(value ?? '');
    this.form.controls.customerId.markAsDirty();
  }

  // ── Prima la testata, poi le righe ──────────────────────────────────────
  //
  // Finché manca il campo che governa le righe, al posto della tabella c'è uno
  // stato vuoto che dice **cosa manca** (`regole-stile-ui` §7). Non una tabella
  // spenta a metà tinta: se una cosa non è utilizzabile, non c'è.
  //
  // Al banco il campo è **uno solo**: la sede, che decide da quale giacenza si
  // scarica o in quale rientra la merce. Il cliente è facoltativo e non entra
  // nel gate (`11` A13).

  protected readonly headerGateActive = computed(() => {
    this.formValue();
    return !this.form.controls.locationId.value;
  });

  protected readonly linesEmptyTitle = computed(() =>
    this.headerGateActive() ? 'Scegli la sede' : 'Nessuna riga inserita',
  );

  protected readonly linesEmptyDescription = computed(() =>
    this.headerGateActive()
      ? 'La sede decide il magazzino movimentato: senza, la disponibilità mostrata sulle righe non sarebbe quella su cui si sta lavorando.'
      : 'Le righe si aggiungono cercando un articolo per codice, SKU, EAN o nome.',
  );

  /**
   * Campo obbligatorio ancora vuoto che tiene ferme le righe: si segna col
   * colore del **campo in attesa** (`--color-field-waiting`), non col rosso
   * dell'errore — aprire un documento nuovo non è uno sbaglio dell'operatore.
   */
  protected readonly locationWaiting = computed(() => this.headerGateActive());

  protected locationInvalid(): boolean {
    const control = this.form.controls.locationId;
    return control.invalid && (control.touched || control.dirty);
  }

  // ── Testata mobile: un pannello apribile, come sulle altre maschere ──────

  protected readonly mobilePanelTitle = computed(() => {
    this.formValue();
    const sede = this.operationalLocations
      .actionLocations()
      .find((loc) => loc.id === this.form.controls.locationId.value)?.name;
    return sede ?? 'Sede da scegliere';
  });

  protected readonly mobilePanelSummaryParts = computed<readonly string[]>(() => {
    this.formValue();
    const parts: string[] = [];
    const cliente = this.customerOptions().find(
      (option) => option.value === this.form.controls.customerId.value,
    );
    if (cliente) {
      parts.push(cliente.label);
    }
    const data = this.form.controls.documentDate.value;
    parts.push(data ? formatIsoDate(data) : 'Data non indicata');
    return parts;
  });

  protected readonly mobileHeaderReady = computed(() => !this.headerGateActive());

  protected readonly mobilePanelStatus = computed(() =>
    this.mobileHeaderReady() ? 'Dati principali completi.' : 'La sede è obbligatoria.',
  );

  // ── Intento di creazione (T15) ──────────────────────────────────────────

  /**
   * L'identità dell'**intento di creazione** della compilazione in corso: è ciò
   * che rende riconoscibile un reinvio. Se la transazione ha già committato e
   * la risposta si è persa, il server ritrova questa identità e restituisce il
   * documento già registrato invece di crearne un secondo.
   *
   * ⛔ **Non si deriva dal contenuto**: due clienti che comprano la stessa
   * maglietta nello stesso minuto producono payload identici, e a distinguere
   * le due vendite può essere solo l'intento.
   */
  private readonly _creationIntentId = signal<string | null>(null);

  /**
   * L'intento da mandare, generato alla prima occorrenza.
   *
   * ⚠️ `undefined` in MODIFICA: lì non si crea niente, e rivendicare un intento
   * impedirebbe la seconda modifica legittima dello stesso documento.
   */
  private creationIntentForSave(): string | undefined {
    if (this.editDocumentId()) {
      return undefined;
    }
    const gia = this._creationIntentId();
    if (gia) {
      return gia;
    }
    const nuovo = crypto.randomUUID();
    this._creationIntentId.set(nuovo);
    return nuovo;
  }

  /**
   * Chiude l'intento **solo se l'errore dice con certezza che non è stato creato
   * niente**. Conservarlo su un esito incerto costa un messaggio da rileggere;
   * chiuderlo per sbaglio costa un secondo documento.
   *
   * ⛔ Il 409 **non è una categoria sola**: `document_number_taken` ha fatto
   * rollback e libera l'intento, mentre `creation_intent_mismatch` e
   * `_in_progress` dicono che un documento c'è o sta nascendo.
   */
  private rotateCreationIntentIfCertain(error: unknown): void {
    if (creationIntentStillHeld(error)) {
      return;
    }
    const incerto =
      !isAppError(error) ||
      error.kind === AppErrorKind.Timeout ||
      error.kind === AppErrorKind.Network ||
      error.kind === AppErrorKind.Server ||
      error.kind === AppErrorKind.Unknown;
    if (!incerto) {
      this._creationIntentId.set(null);
    }
  }

  /**
   * Il documento che quell'intento aveva già creato, quando il server lo nomina
   * (T15 I7): serve a **ricondurre l'operatore al documento**, non a decidere.
   * Chi decide se l'intento è riusabile è il codice dell'errore.
   */
  readonly alreadyCreatedDocumentId = signal<string | null>(null);

  // ── Salvataggio ─────────────────────────────────────────────────────────

  protected readonly savePending = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected dismissSaveError(): void {
    this.saveError.set(null);
  }

  /** L'esito dell'ultimo salvataggio riuscito: numero assegnato e righe. */
  readonly lastResult = signal<StoreSaleResult | null>(null);

  /**
   * Salva il documento: **crea** se non c'è un id in rotta, **risalva lo stesso**
   * se c'è (T1/T2). Un solo percorso client, due contratti sotto — è la
   * modalità a scegliere l'endpoint, non due maschere.
   *
   * ⚠️ **Pubblico e senza chiamante in questa fase**: l'azione che lo invoca —
   * «Concludi vendita» / «Concludi reso» — vive nel piede, e arriva con quello.
   * Che cosa succede DOPO una conclusione riuscita (documento pronto per il
   * prossimo cliente, o si resta su quello appena chiuso) è una decisione dello
   * stesso blocco: qui l'esito si registra e basta.
   */
  save(): void {
    const locationId = this.form.controls.locationId.value;
    if (!locationId || this.savePending()) {
      return;
    }
    this.savePending.set(true);
    this.saveError.set(null);
    const richiesta$ =
      this.descriptor.mode === 'sale'
        ? this.service.createSale(this.salePayload(locationId))
        : this.service.createReturn(this.returnPayload(locationId));

    richiesta$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.savePending.set(false);
        this.lastResult.set(result);
        this.alreadyCreatedDocumentId.set(null);
        // Successo CERTO: l'intento si chiude qui. Il documento dopo è
        // un'altra compilazione, e deve poter essere identico a questo.
        this._creationIntentId.set(null);
      },
      error: (err: unknown) => {
        this.savePending.set(false);
        this.saveError.set(errorMessage(err));
        this.alreadyCreatedDocumentId.set(creationIntentErrorOf(err)?.resultRef ?? null);
        this.rotateCreationIntentIfCertain(err);
      },
    });
  }

  private salePayload(locationId: EntityId): CreateStoreSalePayload {
    const testata = this.preserved();
    return {
      // T1/T2: id assente = crea; presente = risalva LO STESSO documento.
      id: this.editDocumentId() ?? undefined,
      creationIntentId: this.creationIntentForSave(),
      locationId,
      // ⛔ Nessun pagamento (`11` A8): la gestione è differita al blocco
      // Pagamenti/Tesoreria, e l'assenza dice al server «non modificato» —
      // quindi un documento storico non perde il proprio.
      customerId: this.form.controls.customerId.value || undefined,
      documentDate: this.documentDatePayload(),
      notes: testata.notes.trim() || undefined,
      lines: this.lines().map(storeSaleLinePayload),
    };
  }

  private returnPayload(locationId: EntityId): CreateStoreReturnPayload {
    const testata = this.preserved();
    return {
      id: this.editDocumentId() ?? undefined,
      creationIntentId: this.creationIntentForSave(),
      locationId,
      // Il campo è `causale` — `reason` è il nome storico, e non si manda:
      // il server preferisce comunque il primo.
      causale: testata.causale.trim() || undefined,
      // Facoltativo su entrambi i modi (`11` A13).
      customerId: this.form.controls.customerId.value || undefined,
      documentDate: this.documentDatePayload(),
      notes: testata.notes.trim() || undefined,
      lines: this.lines().map(storeReturnLinePayload),
    };
  }

  /**
   * La data viaggia **sempre**, anche in modifica: è modificabile su un
   * documento già concluso, e il server la persiste senza rinumerare
   * (decisione del proprietario, 21/08/2026).
   *
   * ⛔ Qui c'era `if (isEditMode()) return undefined`, scritto quando il server
   * la ignorava in update: era una regola di interfaccia costruita sopra un
   * difetto del server, e ha nascosto il difetto invece di dichiararlo.
   */
  private documentDatePayload(): string | undefined {
    const raw = this.form.controls.documentDate.value;
    return raw ? new Date(raw).toISOString() : undefined;
  }

  /**
   * Riempie la maschera da un documento salvato.
   *
   * ⛔ I valori si prendono dal **documento**, non dall'anagrafica: è la regola
   * «la riga di un documento è una fotografia». Le righe conservano l'id del
   * server, che è ciò che fa aggiornare il movimento collegato invece di
   * riscriverlo.
   */
  private patchFromDocument(doc: DocumentRecord): void {
    this.form.controls.locationId.setValue(doc.locationId ?? '');
    this.form.controls.customerId.setValue(doc.customerId ?? '');
    // La data si carica e **resta modificabile**: una data sbagliata si
    // corregge dove è stata scritta, e il server la persiste senza rinumerare.
    this.form.controls.documentDate.setValue(doc.documentDate.slice(0, 10));
    this.preserved.set({
      notes: doc.notes ?? '',
      causale: doc.causalText ?? '',
    });
    this.lines.set((doc.lines ?? []).map(storeSaleLineFromDocumentLine));
  }
}

/** Data ISO in forma italiana per il riepilogo del pannello mobile. */
function formatIsoDate(iso: string): string {
  const [anno, mese, giorno] = iso.split('-');
  return giorno && mese && anno ? `${giorno}/${mese}/${anno}` : iso;
}

function errorMessage(err: unknown): string {
  if (isAppError(err)) {
    return err.message;
  }
  return 'Operazione non riuscita. Riprova.';
}
