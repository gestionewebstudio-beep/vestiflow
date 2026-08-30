import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { comando, voceEsporta } from '@shared/models/list-action-catalog';
import { listActionState } from '@shared/models/list-selection.model';
import type { ListAction, ListActionState } from '@shared/models/list-selection.model';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import {
  canExportOperationalData,
  canManageFiscalRegister,
} from '@core/permissions/tenant-permissions.util';
import {
  CORRISPETTIVI_ACCOUNTANT_CSV_EXPORT_ID,
  CORRISPETTIVI_ACCOUNTANT_PDF_EXPORT_ID,
  CORRISPETTIVI_ACCOUNTANT_XLS_EXPORT_ID,
} from '@core/export/background-blob-export.constants';
import { vestiflowExportFilename } from '@core/export/background-blob-export-filename.util';
import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import {
  corrispettiviReportEmptyHint,
  corrispettiviReportFilterSubtitle,
  corrispettiviReportSubtitle,
} from '@core/models/tenant-channel-profile.model';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { SegmentedComponent } from '@shared/components/segmented/segmented.component';
import type { SegmentedOption } from '@shared/components/segmented/segmented.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';

import {
  CORRISPETTIVI_REGISTER_COLUMN_DEFS,
  CORRISPETTIVI_REGISTER_COLUMN_PRESETS,
} from '../../models/corrispettivi-columns.config';

import { CorrispettiviOrdersTableComponent } from '../../components/corrispettivi-orders-table/corrispettivi-orders-table.component';
import { CorrispettiviSummaryComponent } from '../../components/corrispettivi-summary/corrispettivi-summary.component';
import {
  type CorrispettiviLocation,
  type CorrispettiviRegisterRow,
  type CorrispettiviSummary,
} from '../../models/corrispettivi.model';
import {
  corrispettiviFiltersToQuery,
  parseCorrispettiviFilters,
  originiPerAmbito,
} from '../../models/corrispettivi-filters.util';
import {
  formatReportPeriodLabel,
  parseReportListQuery,
  periodNeedsYear,
  ReportPeriodPreset,
  resolveReportDateRange,
} from '@domain/reports/models/report-list-query.model';
import { CorrispettiviService } from '../../services/corrispettivi.service';
import {
  parseDataTableSort,
  serializeDataTableSort,
  type DataTableSort,
} from '@shared/components/data-table/data-table.model';
import {
  LOCATION_UNDETERMINED_LABEL,
  corrispettivoSourceLabel,
} from '../../models/corrispettivi-labels.util';
import { ordinaCorrispettivi } from '../../models/corrispettivi-sort.util';

// I valori ammessi dei filtri vivono in `corrispettivi-filters.util.ts`, che è
// il punto unico da cui li leggono sia questa schermata sia l’anteprima di
// stampa.

interface CorrispettiviPageData {
  readonly orders: readonly CorrispettiviRegisterRow[];
  readonly summary: CorrispettiviSummary;
  readonly totalOrders: number;
}

type CorrispettiviState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: CorrispettiviPageData }
  | { readonly status: 'error'; readonly error: AppError };

@Component({
  selector: 'app-corrispettivi-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ListPageComponent,
    ListActionsBarComponent,
    CorrispettiviOrdersTableComponent,
    CorrispettiviSummaryComponent,
    DateInputComponent,
    InlineBannerComponent,
    SegmentedComponent,
    SelectMenuComponent,
  ],
  templateUrl: './corrispettivi-report.component.html',
  styleUrl: './corrispettivi-report.component.scss',
})
export class CorrispettiviReportComponent {
  private readonly corrispettiviService = inject(CorrispettiviService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly blobExport = inject(BackgroundBlobExportService);

  private readonly refreshTick = signal(0);
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly uiPeriod = signal<ReportPeriodPreset | null>(null);

  protected readonly exporting = computed(() =>
    this.blobExport.isActive(CORRISPETTIVI_ACCOUNTANT_CSV_EXPORT_ID),
  );
  protected readonly exportingSpreadsheet = computed(() =>
    this.blobExport.isActive(CORRISPETTIVI_ACCOUNTANT_XLS_EXPORT_ID),
  );
  protected readonly exportingPdf = computed(() =>
    this.blobExport.isActive(CORRISPETTIVI_ACCOUNTANT_PDF_EXPORT_ID),
  );

  constructor() {
    this.columnPreferences.registerView(
      TableViewId.CorrispettiviRegister,
      CORRISPETTIVI_REGISTER_COLUMN_DEFS,
      CORRISPETTIVI_REGISTER_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(this.columnsView);

    effect(() => {
      this.query();
      this.uiPeriod.set(null);
    });
  }

  protected readonly query = computed(() => parseReportListQuery(this.queryParams()));
  protected readonly displayPeriod = computed(() => this.uiPeriod() ?? this.query().period);
  protected readonly periodLabel = computed(() =>
    formatReportPeriodLabel({ ...this.query(), period: this.displayPeriod() }),
  );

  /**
   * Canale, con **«Tutti» come predefinito**.
   *
   * Era «Shopify», e produceva il difetto peggiore: due schermate con lo stesso
   * nome che dicevano numeri diversi per lo stesso trimestre — 95,00 € qui e
   * 324,36 € nel Registro commercialista, che non filtra il canale. La
   * differenza stava in un solo campo, non nel calcolo: entrambe passano dallo
   * stesso `CorrispettiviService.getSummary`.
   *
   * **Fra i due predefiniti vince quello che mostra tutto.** Un totale gonfiato
   * si nota — qualcuno chiede perché ci sono dentro gli ordini manuali; un
   * totale a cui manca una parte no, e nessuno cerca ciò che non vede. Su un
   * registro fiscale è il verso giusto in cui sbagliare.
   *
   * Che alcuni ordini manuali possano essere già coperti da una fattura resta
   * la decisione aperta sull'`excluded_invoiced` (`04` §8), e non si risolve
   * nascondendoli.
   */
  /**
   * **Ambito** e **Canale** sono due assi, non uno.
   *
   * Fino al 16/08/2026 ce n'era uno solo, `channel`, che li mescolava e non
   * sapeva rispondere a «tutto Shopify, online e POS insieme» — perché quella
   * domanda tiene fermo il canale e libero l'ambito.
   */
  /**
   * ⚠️ **Un punto solo per leggere i filtri**, condiviso con l'anteprima di
   * stampa. Le due letture erano separate, e la stampa ne leggeva metà: chi
   * guardava «2° trimestre · Fisico/POS · Resi» stampava tutto il trimestre.
   */
  private readonly filters = computed(() => parseCorrispettiviFilters(this.queryParams()));

  /*
    Gli insiemi che i tre menu mostrano spuntati. **Vuoto = tutte**, e il chip
    lo dice col segnaposto invece che con una casella «Tutti» — che accanto
    alle voci creerebbe lo stato contraddittorio «Tutti insieme ad alcune».
  */
  protected readonly filtriOrigini = computed(() => this.filters().origini);
  protected readonly filtriTipi = computed(() => this.filters().tipi);
  protected readonly filtriSedi = computed(() => this.filters().sedi);

  /**
   * Quale scorciatoia Ambito descrive l'insieme corrente — per il solo chip.
   *
   * ⚠️ **Non è un filtro**: nessuna richiesta e nessun indirizzo lo portano.
   * Se l'operatore affina le origini fino a un insieme che non corrisponde a
   * nessun ambito, il chip torna a «Tutti» — perché la verità è l'insieme, e
   * Ambito ha solo aiutato a comporlo.
   */

  /*
    ⚠️ **Le scorciatoie sulle Origini** (`docs/10` §16) — non un filtro.

    «Ambito» è sparito dall'interfaccia: era un residuo del tempo in cui era una
    dimensione autonoma, e mostrarlo come select accanto a Origine faceva
    credere che fossero due domande.

    Sono tre comandi che compongono l'insieme più usato in un colpo, e finisce
    lì: da quel momento l'operatore affina liberamente dal menu Origine.
  */

  /*
    ⚠️ **Raggruppa è PRESENTAZIONE, non un filtro** (`docs/10` §17).

    Non entra in `corrispettiviFiltersToQuery` e non tocca l'insieme dei dati:
    le righe restano le stesse, nello stesso ordine, e cambia solo come si
    leggono. Tenerlo in un tipo suo è ciò che impedisce che qualcuno, un giorno,
    lo passi a un costruttore di query.
  */
  protected readonly raggruppaOptions: readonly SelectMenuOption[] = [
    { value: 'none', label: 'Nessuno' },
    { value: 'day', label: 'Giorno' },
  ];

  protected readonly raggruppa = computed(() =>
    this.queryParams().get('raggruppa') === 'day' ? 'day' : 'none',
  );

  protected readonly raggruppaPerGiorno = computed(() => this.raggruppa() === 'day');

  protected onRaggruppaChange(value: string | null): void {
    // ⛔ Passando a «Giorno» l'ordinamento manuale si AZZERA, non si mette in
    // pausa: uno stato che esiste e non si vede tornerebbe fuori al cambio
    // successivo senza che nessuno l'abbia chiesto.
    const raggruppa = value === 'day' ? 'day' : null;
    this.updateParams({ raggruppa, ...(raggruppa ? { sort: null } : {}) });
  }
  protected readonly scorciatoieOrigine: readonly SegmentedOption[] = [
    { value: 'all', label: 'Tutte' },
    { value: 'online', label: 'Online' },
    { value: 'fisico_pos', label: 'Fisico/POS' },
  ];

  /**
   * Quale scorciatoia è accesa — **derivata dall'insieme, mai conservata**.
   *
   * Si accende solo se le origini selezionate coincidono **esattamente** col
   * preset. Togliendo una spunta si spegne da sé, e non compare nessun
   * «Personalizzato»: non c'è uno stato in più da spiegare, c'è solo l'insieme.
   *
   * ⚠️ È la ragione per cui la contraddizione non può tornare. Un valore
   * conservato accanto all'insieme sarebbe una seconda verità, e due verità che
   * possono divergere sono esattamente il difetto per cui Ambito è stato
   * ritirato da filtro.
   */
  protected readonly scorciatoiaAttiva = computed<string | null>(() => {
    const scelte = this.filters().origini;
    if (scelte.length === 0) {
      return 'all';
    }
    for (const ambito of ['online', 'fisico_pos'] as const) {
      const preset = originiPerAmbito(ambito);
      if (preset.length === scelte.length && preset.every((id) => scelte.includes(id))) {
        return ambito;
      }
    }
    return null;
  });
  /** Tipo di riga: filtra l'elenco, mai il riepilogo. */

  protected readonly canExport = computed(() =>
    canExportOperationalData(this.authService.currentUser()),
  );

  /**
   * Chi può aggiungere, correggere ed eliminare un Corrispettivo manuale.
   *
   * ⚠️ È la **prima applicazione** di `reports.fiscal_register`: il permesso
   * esisteva ma nessuna rotta, guard o template lo usava. Nascondere il pulsante
   * è ergonomia — il controllo vero sta sull'API, che risponde 403.
   */
  protected readonly canManageRegister = computed(() =>
    canManageFiscalRegister(this.authService.currentUser()),
  );

  /**
   * Le sedi del filtro. Caricate una volta: sono anagrafica, non cambiano col
   * periodo, e ricaricarle a ogni filtro farebbe lampeggiare la tendina.
   */
  private readonly locations = toSignal(
    this.corrispettiviService
      .listLocations()
      .pipe(catchError(() => of([] as readonly CorrispettiviLocation[]))),
    { initialValue: [] as readonly CorrispettiviLocation[] },
  );

  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() =>
    this.locations().map((location) => ({ value: location.id, label: location.name })),
  );

  // ── Colonne configurabili ─────────────────────────────────────────────────
  //
  // Cliente, Email cliente, Pagamento e Nota non sono state rimosse: vivono nel
  // selettore, spente di serie. È la differenza fra togliere un dato e togliergli
  // lo spazio in una vista che si consulta a colpo d'occhio.
  private readonly columnPreferences = inject(TableColumnPreferenceService);
  protected readonly columnsView = TableViewId.CorrispettiviRegister;
  /**
   * Gli **id** delle colonne accese, nell'ordine scelto.
   *
   * Il servizio restituisce le colonne risolte (larghezza, ancoraggio, ordine);
   * alla tabella serve solo sapere quali mostrare — resta dumb, e non impara
   * cos'è una preferenza.
   */
  /**
   * Le colonne visibili, **risolte**, per il motore comune.
   *
   * ⛔ Qui c'era `.map((column) => column.id)`: la pagina buttava via larghezza,
   * ancoraggio e ordine, e la tabella li riscriveva a mano. Da quando il
   * Registro sta sul motore (30/08/2026) le colonne ci arrivano intere, ed è
   * il motore a disegnarle.
   *
   * ⚠️ **Si assegna nel costruttore, non qui**, e la ragione è misurata: i campi
   * si inizializzano PRIMA del corpo del costruttore, quindi `visibleColumns()`
   * verrebbe chiamata prima di `registerView()` e il servizio rifiuterebbe con
   * «Vista tabella non registrata». Sei test di pagina l'hanno detto subito.
   */
  protected readonly tableColumns: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  /** I soli id: serve all'export, che ragiona per colonna e non per larghezza. */
  protected readonly visibleColumns = computed(() =>
    this.tableColumns().map((column) => column.id),
  );

  // ── Periodo: un chip fra i filtri, non una card ───────────────────────────
  //
  // Occupava un riquadro intero per un solo selettore, con titolo e sottotitolo,
  // in cima a una schermata che si consulta a colpo d'occhio. Il periodo È un
  // filtro: sta con gli altri.
  protected readonly periodOptions: readonly SelectMenuOption[] = [
    { value: ReportPeriodPreset.Today, label: 'Oggi' },
    { value: ReportPeriodPreset.Yesterday, label: 'Ieri' },
    { value: ReportPeriodPreset.SpecificDay, label: 'Giorno specifico…' },
    { value: ReportPeriodPreset.Last7Days, label: 'Ultimi 7 giorni' },
    { value: ReportPeriodPreset.Last30Days, label: 'Ultimi 30 giorni' },
    { value: ReportPeriodPreset.ThisMonth, label: 'Mese corrente' },
    { value: ReportPeriodPreset.LastMonth, label: 'Mese scorso' },
    { value: ReportPeriodPreset.ThisYear, label: 'Anno corrente' },
    { value: ReportPeriodPreset.CalendarMonth, label: 'Mese…' },
    { value: ReportPeriodPreset.CalendarQuarter, label: 'Trimestre…' },
    { value: ReportPeriodPreset.CalendarYear, label: 'Anno…' },
    { value: ReportPeriodPreset.Custom, label: 'Personalizzato' },
  ];

  protected readonly monthOptions: readonly SelectMenuOption[] = [
    'Gennaio',
    'Febbraio',
    'Marzo',
    'Aprile',
    'Maggio',
    'Giugno',
    'Luglio',
    'Agosto',
    'Settembre',
    'Ottobre',
    'Novembre',
    'Dicembre',
  ].map((label, index) => ({ value: String(index + 1), label }));

  protected readonly quarterOptions: readonly SelectMenuOption[] = [
    { value: '1', label: '1° trimestre' },
    { value: '2', label: '2° trimestre' },
    { value: '3', label: '3° trimestre' },
    { value: '4', label: '4° trimestre' },
  ];

  /** Cinque anni indietro coprono la conservazione ordinaria. */
  protected readonly yearOptions: readonly SelectMenuOption[] = Array.from(
    { length: 6 },
    (_unused, index) => {
      const anno = new Date().getUTCFullYear() - index;
      return { value: String(anno), label: String(anno) };
    },
  );

  /**
   * I selettori aggiuntivi compaiono SOLO dove hanno senso: «mese corrente» non
   * chiede l'anno, perché è il mese di adesso.
   */
  protected readonly showMonthPicker = computed(
    () => this.displayPeriod() === ReportPeriodPreset.CalendarMonth,
  );
  protected readonly showQuarterPicker = computed(
    () => this.displayPeriod() === ReportPeriodPreset.CalendarQuarter,
  );
  protected readonly showYearPicker = computed(() => periodNeedsYear(this.displayPeriod()));
  protected readonly showCustomDates = computed(
    () => this.displayPeriod() === ReportPeriodPreset.Custom,
  );

  /**
   * Il selettore della **giornata singola**.
   *
   * Ha un campo suo e non riusa quello «da»: sono due domande diverse — «da che
   * giorno a che giorno» e «quale giorno» — e un campo che cambia significato a
   * seconda del preset è il modo in cui si finisce per chiedere «dal 17» e
   * ottenere «il 17 e basta», o viceversa.
   */
  protected readonly showSingleDate = computed(
    () => this.displayPeriod() === ReportPeriodPreset.SpecificDay,
  );

  protected readonly singleDateDraft = computed(() =>
    this.displayPeriod() === ReportPeriodPreset.SpecificDay
      ? (this.query().dateFrom ?? todayIsoDate())
      : '',
  );

  /** La giornata sta in `from`; `to` la ricopia, o sarebbe «da lì in poi». */
  protected onSingleDateChange(value: string): void {
    const giorno = value || todayIsoDate();
    this.updateParams({
      from: giorno,
      to: giorno,
      period: ReportPeriodPreset.SpecificDay,
    });
  }
  protected readonly monthValue = computed(() =>
    this.query().month ? String(this.query().month) : '',
  );
  protected readonly quarterValue = computed(() =>
    this.query().quarter ? String(this.query().quarter) : '',
  );
  protected readonly yearValue = computed(() =>
    this.query().year ? String(this.query().year) : '',
  );

  protected onYearSelect(value: string | null): void {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      this.onYearChange(parsed);
    }
  }

  protected onMonthSelect(value: string | null): void {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      this.onMonthChange(parsed);
    }
  }

  protected onQuarterSelect(value: string | null): void {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      this.onQuarterChange(parsed);
    }
  }

  private readonly tenantProfile = computed(
    () => this.authService.currentUser()?.tenantChannelProfile,
  );
  protected readonly pageSubtitle = computed(() =>
    corrispettiviReportSubtitle(this.tenantProfile()),
  );
  protected readonly filterSubtitle = computed(() =>
    corrispettiviReportFilterSubtitle(this.tenantProfile()),
  );
  protected readonly emptyHint = computed(() => corrispettiviReportEmptyHint(this.tenantProfile()));

  protected readonly dateRange = computed(() =>
    resolveReportDateRange({ ...this.query(), period: this.displayPeriod() }),
  );

  protected readonly dateFromDraft = computed(() => {
    if (this.displayPeriod() !== ReportPeriodPreset.Custom) {
      return '';
    }
    return this.query().dateFrom ?? todayIsoDate();
  });

  protected readonly dateToDraft = computed(() => {
    if (this.displayPeriod() !== ReportPeriodPreset.Custom) {
      return '';
    }
    return this.query().dateTo ?? todayIsoDate();
  });

  /**
   * **Ambito**, non canale — riscritto il 16/08/2026 con due etichette che
   * dicevano il falso: «Shopify» comprendeva le sole vendite online (anche il
   * POS è Shopify), e «Negozio» indicava lo **Shopify POS**, non la cassa di
   * VestiFlow.
   *
   * L'ambito si legge dall'ORIGINE della vendita, che è un fatto: Shopify
   * ecommerce → Online, Shopify POS → Fisico/POS. Nessuno stato da aggiornare.
   */
  /**
   * **Origine**: la terza dimensione, e la sola che isola il Corrispettivo
   * manuale. Ambito e canale non bastano — condivide con la Vendita al banco la
   * coppia Fisico/POS · VestiFlow, quindi chiedendo quella coppia si ottengono
   * entrambe.
   */
  protected readonly origineOptions: readonly SelectMenuOption[] = [
    { value: 'shopify_online', label: 'Shopify online' },
    { value: 'shopify_pos', label: 'Shopify POS' },
    { value: 'store', label: 'Vendita al banco' },
    { value: 'manual_receipt', label: 'Corrispettivo manuale' },
  ];

  protected readonly rowTypeOptions: readonly SelectMenuOption[] = [
    { value: 'sales', label: 'Solo vendite' },
    { value: 'returns', label: 'Solo resi' },
    { value: 'refunds', label: 'Solo rimborsi' },
  ];

  /**
   * ⛔ **Confronto per CONTENUTO, non per identità.**
   *
   * Un `computed` che costruisce un oggetto ne produce uno nuovo a ogni
   * ricalcolo, e `toObservable` lo confronta con `Object.is`: due oggetti
   * identici nel contenuto risultano diversi, il segnale emette e la richiesta
   * riparte. Basta che cambi **un query param qualunque** — l'ordinamento, il
   * raggruppamento, che sono presentazione — perché l'elenco vada a ricaricare
   * dati che ha già.
   *
   * ⚠️ Misurato il 21/08/2026: era la causa principale della lentezza
   * dell'ordinamento. Il `tick` del refresh manuale continua a funzionare,
   * perché quello il contenuto lo cambia davvero.
   */
  private readonly listQuery = computed(
    () => ({
      tick: this.refreshTick(),
      placedFrom: this.dateRange().placedFrom,
      placedTo: this.dateRange().placedTo,
      ...corrispettiviFiltersToQuery(this.filters()),
      // ⚠️ **Nessun `pageSize`**: il Registro è delimitato dal periodo e dai
      // filtri, non da un numero di righe. Qui c'erano `page: 1` fisso e cento
      // righe, senza paginatore in pagina: su un periodo da 850 la schermata
      // scriveva «850 righe nel periodo» e ne mostrava cento.
    }),
    {
      equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    },
  );

  private readonly state = toSignal(
    toObservable(this.listQuery).pipe(
      switchMap((query) =>
        combineLatest([
          this.corrispettiviService.listOrders(query),
          this.corrispettiviService.getSummary(query),
        ]).pipe(
          map(([ordersPage, summary]): CorrispettiviState => ({
            status: 'success',
            data: {
              orders: ordersPage.data,
              summary,
              totalOrders: ordersPage.meta.total,
            },
          })),
          startWith<CorrispettiviState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<CorrispettiviState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies CorrispettiviState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  private readonly data = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.data : null;
  });

  /**
   * L'ordinamento manuale, nell'URL come gli altri filtri.
   *
   * ⛔ **Esiste solo con «Raggruppa: Nessuno»** (`10` §20): col raggruppamento
   * acceso il Registro tiene il suo ordine canonico per giornata. Non si
   * costruisce un «prima il giorno, poi la colonna»: il raggruppamento è già
   * una forma di ordinamento strutturato.
   */
  protected readonly sortState = computed<readonly DataTableSort[]>(() =>
    this.raggruppaPerGiorno() ? [] : parseDataTableSort(this.queryParams().get('sort')),
  );

  protected onSortChange(chiavi: readonly DataTableSort[]): void {
    this.updateParams({ sort: serializeDataTableSort(chiavi) || null });
  }

  /**
   * Le righe come vanno mostrate: filtrate dall'API, poi ordinate qui se
   * l'operatore l'ha chiesto.
   *
   * ⭐ Ordinare nel client è ordinare **tutto il risultato**, non una pagina: il
   * Registro non impagina (`14` §H15). E le etichette con cui si confrontano
   * Tipo, Origine, Sede e Pagamento esistono solo qui — è la ragione per cui
   * l'ordine «per quello che si legge» (§H13) qui si può davvero applicare.
   */
  protected readonly orders = computed(() =>
    ordinaCorrispettivi(this.data()?.orders ?? [], this.sortState(), {
      kind: (row) => (row.kind === 'refund' ? 'Rettifica' : 'Vendita'),
      source: (row) => corrispettivoSourceLabel(row.source),
      location: (row) => row.locationName ?? LOCATION_UNDETERMINED_LABEL,
      financialStatus: (row) => row.financialStatus ?? '',
    }),
  );
  protected readonly summary = computed(() => this.data()?.summary ?? null);
  protected readonly totalOrders = computed(() => this.data()?.totalOrders ?? 0);

  protected onPeriodChange(period: ReportPeriodPreset): void {
    this.uiPeriod.set(period);
    if (period === ReportPeriodPreset.Custom) {
      const today = todayIsoDate();
      this.updateParams({ period, from: today, to: today });
      return;
    }
    // Scegliendo un periodo di calendario si parte da quello corrente: il
    // selettore che compare mostra già un valore sensato invece di restare
    // vuoto in attesa che qualcuno lo riempia.
    if (periodNeedsYear(period)) {
      const now = new Date();
      this.updateParams({
        period,
        from: null,
        to: null,
        year: String(this.query().year ?? now.getUTCFullYear()),
        month:
          period === ReportPeriodPreset.CalendarMonth
            ? String(this.query().month ?? now.getUTCMonth() + 1)
            : null,
        quarter:
          period === ReportPeriodPreset.CalendarQuarter
            ? String(this.query().quarter ?? Math.floor(now.getUTCMonth() / 3) + 1)
            : null,
      });
      return;
    }
    this.updateParams({ period, from: null, to: null, year: null, month: null, quarter: null });
  }

  protected onYearChange(year: number): void {
    this.updateParams({ year: String(year) });
  }

  protected onMonthChange(month: number): void {
    this.updateParams({ month: String(month) });
  }

  protected onQuarterChange(quarter: number): void {
    this.updateParams({ quarter: String(quarter) });
  }

  protected onDateFromChange(value: string): void {
    this.updateParams({ from: value || null, period: ReportPeriodPreset.Custom });
  }

  protected onDateToChange(value: string): void {
    this.updateParams({ to: value || null, period: ReportPeriodPreset.Custom });
  }

  // «all» è il predefinito: non lo si scrive nell'indirizzo.
  /*
    ⚠️ **I filtri si scrivono SOLO al plurale, e i vecchi parametri si
    cancellano** (`docs/10` §16).

    È ciò che rende vera la proprietà «dalla nuova interfaccia
    `nessunRisultato` non è producibile»: quello stato nasce da una
    CONTRADDIZIONE fra `ambito`, `canale` e `origine`, che erano tre vincoli
    indipendenti. Scrivendo un insieme solo, non c'è più niente con cui
    contraddirsi — e ripulendo i tre vecchi parametri non ne resta uno appeso
    nell'indirizzo a contraddire quello nuovo.

    Senza la pulizia, un operatore che arriva da un vecchio collegamento e poi
    tocca un filtro si troverebbe l'indirizzo mezzo vecchio e mezzo nuovo: il
    parser darebbe la precedenza al plurale, ma i residui resterebbero lì a
    confondere chi lo legge o lo condivide.
  */
  private updateFiltri(patch: Record<string, string | null>): void {
    this.updateParams({
      ...patch,
      ambito: null,
      canale: null,
      origine: null,
      rowType: null,
      locationId: null,
      refundsOnly: null,
    });
  }

  /** Insieme vuoto = nessuna restrizione: il parametro sparisce dall'indirizzo. */
  private valoreInsieme(values: readonly string[]): string | null {
    return values.length > 0 ? values.join(',') : null;
  }

  /**
   * **Ambito è una scorciatoia, non un filtro** (§16).
   *
   * Spunta un gruppo di origini e finisce lì: da quel momento l'operatore
   * affina liberamente, e Ambito non continua a dire rigidamente «Fisico/POS».
   * Non viaggia più nell'indirizzo, quindi non può più contraddire l'insieme
   * che ha inizializzato — che era il difetto per cui è stato ritirato.
   */
  /**
   * La scorciatoia tocca SOLO l'insieme delle origini, e non lascia traccia di
   * sé: non esiste un parametro «ambito» nella nuova interfaccia, quindi non
   * c'è niente che possa contraddire l'insieme che ha appena composto.
   */
  protected onScorciatoiaOrigine(value: string): void {
    const ambito = value === 'online' || value === 'fisico_pos' ? value : 'all';
    this.updateFiltri({ origini: this.valoreInsieme(originiPerAmbito(ambito)) });
  }

  protected onOrigineValues(values: readonly string[]): void {
    this.updateFiltri({ origini: this.valoreInsieme(values) });
  }

  protected onTipiValues(values: readonly string[]): void {
    this.updateFiltri({ tipi: this.valoreInsieme(values) });
  }

  protected onSediValues(values: readonly string[]): void {
    this.updateFiltri({ sedi: this.valoreInsieme(values) });
  }

  /** «+ Aggiungi corrispettivo»: la primary CTA della pagina (`docs/10` §12). */
  protected addManualReceipt(): void {
    void this.router.navigate(['/app/sales/corrispettivi/nuovo']);
  }

  protected openManualReceipt(id: string): void {
    void this.router.navigate(['/app/sales/corrispettivi', id, 'modifica']);
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected exportAccountantCsv(): void {
    if (this.exporting() || !this.canExport()) {
      return;
    }

    this.blobExport.start({
      exportId: CORRISPETTIVI_ACCOUNTANT_CSV_EXPORT_ID,
      request: this.corrispettiviService.exportAccountantCsv(this.exportQuery()),
      filename: vestiflowExportFilename('corrispettivi-commercialista', 'csv'),
      inProgressMessage: 'Export CSV commercialista in corso. Puoi continuare a navigare.',
      successMessage: 'Export CSV commercialista completato: download avviato.',
      errorMessage: 'Export CSV non riuscito. Riprova tra qualche istante.',
    });
  }

  protected exportSpreadsheet(): void {
    if (this.exportingSpreadsheet() || !this.canExport()) {
      return;
    }

    this.blobExport.start({
      exportId: CORRISPETTIVI_ACCOUNTANT_XLS_EXPORT_ID,
      request: this.corrispettiviService.exportSpreadsheet(this.exportVistaQuery()),
      filename: vestiflowExportFilename('corrispettivi-commercialista', 'xls'),
      inProgressMessage: 'Export foglio commercialista in corso. Puoi continuare a navigare.',
      successMessage: 'Export foglio completato: download avviato.',
      errorMessage: 'Export foglio non riuscito. Riprova tra qualche istante.',
    });
  }

  protected exportPdf(): void {
    if (this.exportingPdf() || !this.canExport()) {
      return;
    }

    this.blobExport.start({
      exportId: CORRISPETTIVI_ACCOUNTANT_PDF_EXPORT_ID,
      request: this.corrispettiviService.exportPdf(this.exportVistaQuery()),
      filename: vestiflowExportFilename('corrispettivi-commercialista', 'pdf'),
      inProgressMessage: 'Export PDF commercialista in corso. Puoi continuare a navigare.',
      successMessage: 'Export PDF completato: download avviato.',
      errorMessage: 'Export PDF non riuscito. Riprova tra qualche istante.',
    });
  }

  /**
   * Pannello filtri mobile: sotto `lg` i chip spariscono e il loro posto lo
   * prende un solo pulsante «Filtri (n)». Stesso pattern delle quattro pagine
   * registro (`_list-page.scss`, mixin `list-page-mobile-filters`): apertura
   * UI pura, i filtri dentro il pannello scrivono sugli stessi signal dei
   * gemelli desktop, quindi non esiste uno stato «del pannello» da allineare.
   */
  protected readonly mobileFiltersOpen = signal(false);

  /**
   * Quanti filtri restringono l'insieme, per il badge del pulsante. Periodo e
   * Raggruppa NON contano: il primo ha sempre un valore (non è mai «spento»),
   * il secondo non filtra niente — cambia solo come si leggono le stesse righe.
   */
  protected readonly activeFilterCount = computed(() => {
    const f = this.filters();
    let count = 0;
    if (f.origini.length) count++;
    if (f.tipi.length) count++;
    if (f.sedi.length) count++;
    return count;
  });

  /**
   * Le quattro azioni di export dietro un comando solo. Su mobile cinque
   * pulsanti in testata prendevano due file prima che si vedesse un dato:
   * l'operatore che consulta il registro dal telefono esporta di rado, e un
   * comando raccolto costa un tocco in più solo a chi lo usa davvero.
   */
  /**
   * ⭐ **Le quattro azioni, dichiarate una volta sola** sul contratto comune
   * degli elenchi (`14` parte D).
   *
   * ⛔ **Refactor infrastrutturale, zero cambiamenti**: stesse azioni, stesse
   * etichette, stesse icone, stesse varianti, stessi stati di caricamento e
   * stessi handler. Cambia solo *dove sono dichiarate* — prima vivevano in tre
   * posti: i quattro pulsanti del template, l'elenco delle voci del menu
   * mobile e lo `switch` che le smistava. Tre elenchi da tenere allineati a
   * mano, e il menu era già una copia dei pulsanti.
   *
   * ⚠️ **`requires: 'none'` è la verità, qui**: i tre export passano dal server
   * con i filtri della pagina, e la stampa porta gli stessi filtri nell'URL.
   * Sono azioni che lavorano sul risultato filtrato per costruzione — l'unico
   * riepilogo dove lo erano già prima del contratto.
   *
   * ⛔ **La selezione NON entra in questo passaggio.** Le righe del Registro
   * hanno id compositi (`sale:…`, `refund:…`, `store:…`) perché la vista
   * unisce più sorgenti: filtrare un export per id scelti è un lavoro
   * sull'aggregazione, e senza quello una checkbox esporterebbe tutto lo stesso
   * — in silenzio.
   */
  protected readonly listActions = computed<readonly ListAction[]>(() => [
    // ⭐ **La forma dei comandi viene dal CATALOGO**, non riscritta qui: era
    //    così che «Stampa» era diventata ghost solo su questa pagina, e «CSV»
    //    aveva tre icone diverse in tre elenchi (misurato il 30/08/2026).
    ...(this.canManageRegister()
      ? [
          comando('new', {
            ariaLabel: 'Aggiungi corrispettivo',
            run: () => this.addManualReceipt(),
          }),
        ]
      : []),

    // ⭐ **Stampa, Excel ed Esporta sono TRE comandi** (`14` §5.2), ed Esporta
    //    è il menu dei tracciati — deciso dal proprietario il 30/08/2026.
    //
    // ⛔ Qui PDF e CSV erano due pulsanti a sé, in fila con gli altri: quattro
    //    comandi per quattro formati. Sulle altre pagine erano già voci del
    //    menu, e la stessa cosa aveva due forme.
    ...(this.canExport()
      ? [
          comando('print', { run: () => this.printReport() }),
          comando('excel', {
            busy: this.exportingSpreadsheet(),
            run: () => this.exportSpreadsheet(),
          }),
          comando('export', {
            busy: this.exportingPdf() || this.exporting(),
            items: [
              voceEsporta('pdf', () => this.exportPdf()),
              voceEsporta('csv', () => this.exportAccountantCsv()),
            ],
          }),
        ]
      : []),
  ]);

  /** Lo stato di un'azione: dal contratto comune, non da regole locali. */
  protected actionState(action: ListAction): ListActionState {
    return listActionState(action, 0);
  }

  protected onExportAction(id: string): void {
    const azione = this.listActions().find((candidate) => candidate.id === id);
    if (!azione || this.actionState(azione).disabled) {
      return;
    }
    // Ambito `filtered`: qui non esiste selezione, e non deve fingere di sì.
    azione.run?.({ scope: 'filtered' });
  }

  protected printReport(): void {
    void this.router.navigate(['/app/sales/corrispettivi/print'], {
      queryParams: {
        // La stampa deve mostrare quello che si sta guardando: periodo,
        // calendario e canale viaggiano tutti, o si stampa un altro registro.
        period: this.displayPeriod(),
        from: this.query().dateFrom ?? null,
        to: this.query().dateTo ?? null,
        year: this.query().year ?? null,
        month: this.query().month ?? null,
        quarter: this.query().quarter ?? null,
        // ⚠️ **I filtri viaggiano al PLURALE** (`docs/10` §16): la stampa deve
        // ricevere l'insieme, non una sua approssimazione a un valore solo —
        // che è come la divergenza precedente era nata. Insieme vuoto = nessuna
        // restrizione, quindi il parametro non parte.
        origini: this.filters().origini.length ? this.filters().origini.join(',') : null,
        tipi: this.filters().tipi.length ? this.filters().tipi.join(',') : null,
        sedi: this.filters().sedi.length ? this.filters().sedi.join(',') : null,
        nessunRisultato: this.filters().nessunRisultato ? 'true' : null,
      },
    });
  }

  /**
   * Gli stessi filtri della lista, senza eccezioni.
   *
   * È la ragione per cui questo metodo esiste invece di ricostruire l'oggetto
   * dove serve: il file esportato e la schermata devono rispondere alla stessa
   * domanda, e l'unico modo di garantirlo è che leggano gli stessi campi.
   */
  private exportQuery() {
    return {
      placedFrom: this.dateRange().placedFrom,
      placedTo: this.dateRange().placedTo,
      ...corrispettiviFiltersToQuery(this.filters()),
    };
  }

  /*
    ⚠️ **Due famiglie di export, e la differenza è deliberata** (`docs/10` §17).

    PDF ed Excel sono «esporta ciò che sto guardando»: oltre ai filtri portano
    anche la PRESENTAZIONE — raggruppamento e colonne accese.

    Il CSV no, e non è una dimenticanza: è l'export DATI per il commercialista.
    Una riga per evento, nessuna riga artificiale di subtotale, e le dodici
    colonne storiche nella stessa posizione — perché qualcuno ci ha agganciato
    un foglio, e spostargliele sotto i piedi romperebbe il suo lavoro senza che
    nessuno se ne accorga da questa parte.
  */
  private exportVistaQuery() {
    return {
      ...this.exportQuery(),
      raggruppa: this.raggruppa(),
      colonne: this.visibleColumns(),
    };
  }

  private updateParams(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
