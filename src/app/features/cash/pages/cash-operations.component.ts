import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';

import type { EntityId } from '@core/models/common.model';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { formatMoney } from '@core/utils/money.util';
import type {
  CashOperationKind,
  CashOperationRow,
  CashOperationsPage,
  ReceiptSearchResult,
} from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableRowTone,
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { NavTabsComponent } from '@shared/components/nav-tabs/nav-tabs.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { colonnaVisibile } from '@shared/models/list-card-fields.util';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';

import { CASH_TABS } from '../models/cash-nav';
import {
  CASH_OPERATIONS_COLUMN_DEFS,
  CASH_OPERATIONS_COLUMN_PRESETS,
} from '../models/cash-register-columns.config';

/** Il debounce della ricerca e' quello degli altri elenchi, non uno suo. */
const RICERCA_DEBOUNCE_MS = 300;

interface StatoRegistro {
  readonly pagina: CashOperationsPage | null;
  readonly caricamento: boolean;
  readonly errore: string | null;
}

const IN_ATTESA: StatoRegistro = { pagina: null, caricamento: true, errore: null };

/**
 * Il **registro operativo** della Cassa: riepilogo e operazioni, su tutte le
 * sedi comprese nel perimetro dell'utente.
 *
 * ⛔ **Non e' il Registro corrispettivi.** Quello e' contabile e aggrega valori
 * economici; questo serve a vedere le operazioni — chi, quando, con quali
 * quote, con quale resto. Le stesse vendite alimentano entrambi, per strade
 * diverse e senza doppia contabilizzazione.
 *
 * ⛔ **Nessun totale si calcola qui**: il riepilogo arriva dal server, con lo
 * stesso filtro dell'elenco.
 *
 * ⭐ **E l'elenco non impagina** (05/09/2026): chiede `all=1` e riceve TUTTO il
 * risultato del filtro attivo, sul percorso condiviso di clienti, prodotti,
 * documenti e vendite online. Il contenimento e' il PERIODO, non un numero di
 * righe — `regole-stile-ui`, «NESSUN TETTO DI RIGHE».
 *
 * ⛔ **Qui c'era `pageSize: 5_000`**, e prima ancora `100`: un tetto piu' alto
 * resta un tetto, e le operazioni oltre la soglia restavano irraggiungibili
 * perche' nessuno chiedeva la pagina due.
 */
@Component({
  selector: 'app-cash-operations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BadgeComponent,
    ButtonComponent,
    DataTableCellDirective,
    DataTableComponent,
    DataTableRowCardDirective,
    DateInputComponent,
    ListPageComponent,
    NavTabsComponent,
    SelectMenuComponent,
    SlidePanelComponent,
  ],
  templateUrl: './cash-operations.component.html',
  styleUrl: './cash-operations.component.scss',
})
export class CashOperationsComponent {
  private readonly api = inject(CashApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sedi = inject(OperationalLocationsService);
  private readonly tipiPagamento = inject(PaymentOptionsService);
  private readonly router = inject(Router);
  private readonly preferenzeColonne = inject(TableColumnPreferenceService);

  /** ⭐ Le tre aree della Cassa: dichiarate una volta, usate da entrambi i registri. */
  protected readonly schede = CASH_TABS;

  protected readonly vista = TableViewId.CashOperations;

  // ── Filtri ───────────────────────────────────────────────────────────────
  protected readonly da = signal('');
  protected readonly a = signal('');
  protected readonly sedeId = signal<EntityId | null>(null);
  protected readonly tipo = signal<CashOperationKind | null>(null);
  protected readonly tipoPagamento = signal<EntityId | null>(null);
  /** Quello che si digita: entra nella richiesta solo dopo il debounce. */
  protected readonly numero = signal('');
  private readonly numeroApplicato = signal('');
  protected readonly soloAnomalie = signal(false);

  /** Il giro di rilettura: cambiarlo rifa' la richiesta senza toccare i filtri. */
  private readonly rilettura = signal(0);

  // ── Richiamo scontrino ───────────────────────────────────────────────────
  protected readonly pannelloReso = signal(false);
  protected readonly ricercaScontrino = signal('');
  protected readonly scontrini = signal<readonly ReceiptSearchResult[]>([]);
  protected readonly cercandoScontrini = signal(false);

  protected readonly opzioni = toSignal(
    this.tipiPagamento.list('method').pipe(catchError(() => of([] as readonly PaymentOption[]))),
    { initialValue: [] as readonly PaymentOption[] },
  );

  protected readonly sediSelezionabili = computed(() =>
    this.sedi.locations().map((l) => ({ value: l.id, label: l.name })),
  );

  protected readonly opzioniSelezionabili = computed(() =>
    this.opzioni()
      .filter((o) => o.kind === 'method')
      .map((o) => ({ value: o.id, label: o.name })),
  );

  protected readonly tipiOperazione = [
    { value: 'sale', label: 'Vendite' },
    { value: 'return', label: 'Resi' },
  ];

  private readonly richiesta = computed(() => ({
    from: this.da() || undefined,
    to: this.a() || undefined,
    locationId: this.sedeId() ?? undefined,
    kind: this.tipo() ?? undefined,
    paymentOptionId: this.tipoPagamento() ?? undefined,
    number: this.numeroApplicato().trim() || undefined,
    anomaliesOnly: this.soloAnomalie() || undefined,
    giro: this.rilettura(),
  }));

  /**
   * ⛔ **UNA richiesta alla volta, e vince l'ULTIMA CHIESTA.**
   *
   * Qui c'era un `carica()` che apriva una sottoscrizione nuova a ogni cambio
   * di filtro senza chiudere la precedente: con due richieste in volo vinceva
   * **l'ultima che tornava**. Un filtro largo seguito da uno stretto lasciava a
   * schermo il risultato largo — e non falliva: mostrava di piu'.
   *
   * ⭐ `switchMap` annulla la precedente, ed e' la forma degli altri elenchi.
   */
  private readonly stato = toSignal(
    toObservable(this.richiesta).pipe(
      switchMap(({ giro: _giro, ...filtri }) =>
        this.api.operations(filtri, { tutto: true }).pipe(
          map((p): StatoRegistro => ({ pagina: p, caricamento: false, errore: null })),
          catchError(() =>
            of<StatoRegistro>({
              pagina: null,
              caricamento: false,
              errore: 'Non è stato possibile leggere il registro.',
            }),
          ),
          startWith(IN_ATTESA),
        ),
      ),
    ),
    { initialValue: IN_ATTESA },
  );

  protected readonly pagina = computed(() => this.stato().pagina);
  protected readonly caricamento = computed(() => this.stato().caricamento);
  protected readonly errore = computed(() => this.stato().errore);

  protected readonly colonneVisibili: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  /**
   * ⭐ **I filtri di colonna del motore**, gli stessi degli altri elenchi.
   *
   * ⚠️ **`numeroDi` e `dataDi` non sono facoltativi qui**: senza, le colonne
   * `range` e `date` NON filtrano invece di filtrare male — un confronto sul
   * testo formattato metterebbe «−5,00 €» dopo «10,00 €» e gennaio dopo
   * dicembre.
   */
  protected readonly righeFiltrate = createColumnFilters<CashOperationRow>({
    viewId: () => this.vista,
    righe: () => this.pagina()?.items ?? [],
    cellText: (riga, colonna) => this.cellText(riga, colonna),
    numeroDi: (riga, colonna) => (colonna === 'total' ? riga.totalMinor : null),
    dataDi: (riga, colonna) => (colonna === 'createdAt' ? riga.createdAt : null),
  });

  /**
   * ⭐ **L'ordinamento e' della PAGINA, non del motore**: il motore emette la
   * pressione, chi ha le righe le riordina. Qui in memoria, e ora si puo':
   * l'elenco e' caricato tutto, quindi ordinare non riordina «una pagina».
   *
   * ⛔ **Era spento** con la motivazione che «l'API non ha un parametro `sort`»
   * — vera, e non piu' un impedimento: con tutto il risultato in mano il
   * confronto e' completo. Le stesse tre funzioni dei filtri, e il collatore
   * italiano condiviso di `sortByKeys`.
   */
  protected readonly ordine = signal<readonly DataTableSort[]>([]);

  private readonly righeOrdinate = computed(() =>
    ordinaPerColonne(this.righeFiltrate(), this.ordine(), {
      cellText: (riga, colonna) => this.cellText(riga, colonna),
      numeroDi: (riga, colonna) => (colonna === 'total' ? riga.totalMinor : null),
      dataDi: (riga, colonna) => (colonna === 'createdAt' ? riga.createdAt : null),
    }),
  );

  protected readonly sezioni = computed<readonly DataTableSection<CashOperationRow>[]>(() => [
    { id: 'tutte', rows: this.righeOrdinate() },
  ]);

  protected readonly vuoto = computed(
    () => !this.caricamento() && !this.errore() && (this.pagina()?.items.length ?? 0) === 0,
  );

  protected readonly filtriAttivi = computed(
    () =>
      (this.da() ? 1 : 0) +
      (this.a() ? 1 : 0) +
      (this.sedeId() ? 1 : 0) +
      (this.tipo() ? 1 : 0) +
      (this.tipoPagamento() ? 1 : 0) +
      (this.soloAnomalie() ? 1 : 0),
  );

  constructor() {
    this.preferenzeColonne.registerView(
      this.vista,
      CASH_OPERATIONS_COLUMN_DEFS,
      CASH_OPERATIONS_COLUMN_PRESETS,
    );
    this.colonneVisibili = this.preferenzeColonne.visibleColumns(this.vista);

    // Stessa forma degli altri elenchi: si digita, si aspetta, si ricarica.
    toObservable(this.numero)
      .pipe(
        debounceTime(RICERCA_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((testo) => this.numeroApplicato.set(testo));
  }

  /** Rilegge senza toccare i filtri: e' il gesto di «Riprova». */
  protected carica(): void {
    this.rilettura.update((n) => n + 1);
  }

  protected azzeraFiltri(): void {
    this.da.set('');
    this.a.set('');
    this.sedeId.set(null);
    this.tipo.set(null);
    this.tipoPagamento.set(null);
    this.numero.set('');
    this.numeroApplicato.set('');
    this.soloAnomalie.set(false);
  }

  // ── Il richiamo dello scontrino ──────────────────────────────────────────

  protected apriRichiamo(): void {
    this.pannelloReso.set(true);
    this.scontrini.set([]);
    this.ricercaScontrino.set('');
  }

  /**
   * ⛔ **Nessun UUID.** Si cerca per numero, articolo o cliente: l'operatore
   * non conosce un identificativo e non deve impararlo.
   */
  protected cercaScontrino(): void {
    const testo = this.ricercaScontrino().trim();
    this.cercandoScontrini.set(true);
    this.api
      .searchReceipts({ text: testo || undefined, limit: 20 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trovati) => {
          this.scontrini.set(trovati);
          this.cercandoScontrini.set(false);
        },
        error: () => {
          this.scontrini.set([]);
          this.cercandoScontrini.set(false);
        },
      });
  }

  protected vaiAlReso(documentId: EntityId): void {
    this.pannelloReso.set(false);
    void this.router.navigate(['/app/cassa/operazioni', documentId, 'reso']);
  }

  // ── Presentazione ────────────────────────────────────────────────────────

  protected readonly rowId = (riga: CashOperationRow): string => riga.id;

  protected readonly rowLabel = (riga: CashOperationRow): string =>
    `Apri l'operazione ${riga.reference}`;

  /**
   * ⭐ **Annullata muta, reso negativo.** Erano due classi CSS sulla riga; il
   * tono e' del motore, e vale anche sulla card dove le classi non arrivavano.
   */
  protected readonly rowTone = (riga: CashOperationRow): DataTableRowTone | null => {
    if (riga.status === 'cancelled') {
      return 'muted';
    }
    return riga.kind === 'return' ? 'negative' : null;
  };

  protected apri(riga: CashOperationRow): void {
    void this.router.navigate(['/app/cassa/operazioni', riga.id]);
  }

  protected apriOrigine(riga: CashOperationRow): void {
    if (riga.sourceDocumentId) {
      void this.router.navigate(['/app/cassa/operazioni', riga.sourceDocumentId]);
    }
  }

  protected visibile(id: string): boolean {
    return colonnaVisibile(this.colonneVisibili(), id);
  }

  protected readonly cellText = (riga: CashOperationRow, colonna: string): string => {
    switch (colonna) {
      case 'createdAt':
        return formattaIstante(riga.createdAt);
      case 'type':
        return riga.kind === 'sale' ? 'Vendita' : 'Reso';
      case 'reference':
        return riga.reference;
      case 'location':
        return riga.locationName ?? '—';
      case 'operator':
        return riga.operatorName;
      case 'paymentMethod':
        return this.pagamento(riga);
      case 'source':
        return riga.sourceReference ?? '—';
      case 'status':
        return this.statoDi(riga);
      case 'total':
        return this.soldi(riga.totalMinor);
      default:
        return '';
    }
  };

  protected soldi(minor: number): string {
    return formatMoney({ amountMinor: minor, currencyCode: 'EUR' });
  }

  /** «Contanti», «Carta», o «Misto» quando le quote sono piu' di una. */
  protected pagamento(riga: CashOperationRow): string {
    if (riga.mixed) {
      return 'Misto';
    }
    return riga.payments[0]?.optionName ?? '—';
  }

  /**
   * ⚠️ Si chiama `statoDi` e non `stato`: `stato` e' il flusso della richiesta,
   * e due membri non possono avere lo stesso nome.
   */
  protected statoDi(riga: CashOperationRow): string {
    const prima = riga.anomalies[0];
    return prima ? this.etichettaAnomalia(prima) : 'Registrata';
  }

  protected tonoStato(riga: CashOperationRow): 'success' | 'warning' | 'error' {
    if (riga.anomalies.length === 0) {
      return 'success';
    }
    return riga.anomalies.includes('annullato') ? 'error' : 'warning';
  }

  protected etichettaAnomalia(codice: string): string {
    return ANOMALIE[codice] ?? codice;
  }
}

/**
 * ⚠️ **Senza `DatePipe`**: la pipe serviva solo a due celle, e una cella del
 * motore e' testo — il testo lo produce `cellText`, non il template.
 */
function formattaIstante(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '—';
  }
  const due = (n: number): string => String(n).padStart(2, '0');
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()} ${due(d.getHours())}:${due(d.getMinutes())}`;
}

/** Le anomalie, come le legge un operatore. */
const ANOMALIE: Record<string, string> = {
  annullato: 'Annullato',
  quota_non_classificata: 'Incasso senza classe',
  reso_senza_origine: 'Reso senza vendita',
  rimborso_non_agganciato: 'Rimborso non collegato',
  quote_non_quadrate: 'Incassi non quadrati',
};
