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
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
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
  ambitoEsprimibile,
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
    BackButtonComponent,
    ButtonComponent,
    CorrispettiviOrdersTableComponent,
    CorrispettiviSummaryComponent,
    DateInputComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    InlineBannerComponent,
    SelectMenuComponent,
    TableColumnPickerComponent,
    TableSkeletonComponent,
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
  protected readonly ambitoFilter = computed(() => ambitoEsprimibile(this.filters().origini));
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
  protected readonly visibleColumns = computed(() =>
    this.columnPreferences
      .visibleColumns(this.columnsView)()
      .map((column) => column.id),
  );

  // ── Periodo: un chip fra i filtri, non una card ───────────────────────────
  //
  // Occupava un riquadro intero per un solo selettore, con titolo e sottotitolo,
  // in cima a una schermata che si consulta a colpo d'occhio. Il periodo È un
  // filtro: sta con gli altri.
  protected readonly periodOptions: readonly SelectMenuOption[] = [
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
   * ⚠️ **Le opzioni NON contengono la voce «Tutti», ed è la convenzione di
   * `app-select-menu`**: il filtro spento è la **stringa vuota**, e a dire
   * «Tutti» è il `placeholder`.
   *
   * Qui c'era una voce `value: 'all'`, e il difetto si vedeva a schermo: per il
   * componente `'all'` è un valore come un altro, quindi il chip si credeva
   * sempre attivo — la chevron spariva, compariva la **×** che azzera un filtro
   * che non c'era, e il testo finiva tagliato sotto di lei («Tutti gli ambi✕»).
   */
  protected readonly ambitoOptions: readonly SelectMenuOption[] = [
    { value: 'online', label: 'Online' },
    { value: 'fisico_pos', label: 'Fisico/POS' },
  ];

  /** Canale: chi ha raccolto la vendita. */
  protected readonly canaleOptions: readonly SelectMenuOption[] = [
    { value: 'shopify', label: 'Shopify' },
    { value: 'vestiflow', label: 'VestiFlow' },
  ];

  /**
   * Il valore che il chip deve vedere: `''` quando il filtro è spento.
   *
   * La catena interna resta su `'all'` — è il valore che l'API accetta e che
   * l'indirizzo omette — e questa è la sola traduzione verso il componente.
   */
  protected chipValue(value: string): string {
    return value === 'all' ? '' : value;
  }

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

  private readonly listQuery = computed(() => ({
    tick: this.refreshTick(),
    placedFrom: this.dateRange().placedFrom,
    placedTo: this.dateRange().placedTo,
    ...corrispettiviFiltersToQuery(this.filters()),
    // ⚠️ **Nessun `pageSize`**: il Registro è delimitato dal periodo e dai
    // filtri, non da un numero di righe. Qui c'erano `page: 1` fisso e cento
    // righe, senza paginatore in pagina: su un periodo da 850 la schermata
    // scriveva «850 righe nel periodo» e ne mostrava cento.
  }));

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

  protected readonly orders = computed(() => this.data()?.orders ?? []);
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
  protected onAmbitoChange(value: string | null): void {
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
      request: this.corrispettiviService.exportSpreadsheet(this.exportQuery()),
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
      request: this.corrispettiviService.exportPdf(this.exportQuery()),
      filename: vestiflowExportFilename('corrispettivi-commercialista', 'pdf'),
      inProgressMessage: 'Export PDF commercialista in corso. Puoi continuare a navigare.',
      successMessage: 'Export PDF completato: download avviato.',
      errorMessage: 'Export PDF non riuscito. Riprova tra qualche istante.',
    });
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
