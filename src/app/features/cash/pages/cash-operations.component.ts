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
import { catchError, debounceTime, distinctUntilChanged, of } from 'rxjs';

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
} from '@shared/components/data-table/data-table.model';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { NavTabsComponent } from '@shared/components/nav-tabs/nav-tabs.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { colonnaVisibile } from '@shared/models/list-card-fields.util';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { TableViewId } from '@shared/table-columns/table-column.model';

import {
  CASH_OPERATIONS_COLUMN_DEFS,
  CASH_OPERATIONS_COLUMN_PRESETS,
} from '../models/cash-register-columns.config';
import { CASH_TABS } from '../models/cash-nav';

/** Il debounce della ricerca e' quello degli altri elenchi, non uno suo. */
const RICERCA_DEBOUNCE_MS = 300;

/**
 * Il **registro operativo** della Cassa: riepilogo e operazioni, su tutte le
 * sedi comprese nel perimetro dell'utente.
 *
 * ⛔ **Non e' il Registro corrispettivi.** Quello e' contabile e aggrega valori
 * economici; questo serve a vedere le operazioni — chi, quando, con quali
 * quote, con quale resto. Le stesse vendite alimentano entrambi, per strade
 * diverse e senza doppia contabilizzazione.
 *
 * ⛔ **Nessun totale si calcola qui**: elenco e riepilogo arrivano dallo stesso
 * filtro, dal server. Sommare le righe a schermo darebbe il totale della
 * PAGINA, non del periodo.
 *
 * ⭐ **Sul telaio e sul motore comuni dal 04/09/2026.** Qui c'erano un
 * contenitore pagina proprio, nove `<th>` scritti a mano e una fascia riepilogo
 * con la propria tipografia: tre pattern che esistevano gia', e che riscritti a
 * mano non portavano il selettore Colonne, le larghezze regolabili ne' la vista
 * a card.
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

  protected readonly pagina = signal<CashOperationsPage | null>(null);
  protected readonly caricamento = signal(false);
  protected readonly errore = signal<string | null>(null);

  // ── Filtri ───────────────────────────────────────────────────────────────
  protected readonly da = signal('');
  protected readonly a = signal('');
  protected readonly sedeId = signal<EntityId | null>(null);
  protected readonly tipo = signal<CashOperationKind | null>(null);
  protected readonly tipoPagamento = signal<EntityId | null>(null);
  protected readonly numero = signal('');
  protected readonly soloAnomalie = signal(false);

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

  /**
   * ⚠️ **Le larghezze vengono dal tipo della colonna**, non da un numero
   * scritto qui: il motore le deduce da `numeric` e `display`
   * (`regole-stile-ui`, «Le larghezze NON si scrivono a mano in undici file»).
   */
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

  protected readonly sezioni = computed<readonly DataTableSection<CashOperationRow>[]>(() => [
    { id: 'tutte', rows: this.righeFiltrate() },
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

    this.carica();

    // Stessa forma degli altri elenchi: si digita, si aspetta, si ricarica.
    toObservable(this.numero)
      .pipe(
        debounceTime(RICERCA_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.carica());
  }

  protected carica(): void {
    this.caricamento.set(true);
    this.errore.set(null);
    this.api
      .operations({
        page: 1,
        pageSize: 100,
        from: this.da() || undefined,
        to: this.a() || undefined,
        locationId: this.sedeId() ?? undefined,
        kind: this.tipo() ?? undefined,
        paymentOptionId: this.tipoPagamento() ?? undefined,
        number: this.numero().trim() || undefined,
        anomaliesOnly: this.soloAnomalie() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.pagina.set(p);
          this.caricamento.set(false);
        },
        error: () => {
          this.pagina.set(null);
          this.errore.set('Non è stato possibile leggere il registro.');
          this.caricamento.set(false);
        },
      });
  }

  protected azzeraFiltri(): void {
    this.da.set('');
    this.a.set('');
    this.sedeId.set(null);
    this.tipo.set(null);
    this.tipoPagamento.set(null);
    this.numero.set('');
    this.soloAnomalie.set(false);
    this.carica();
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
        return this.stato(riga);
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

  protected stato(riga: CashOperationRow): string {
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
