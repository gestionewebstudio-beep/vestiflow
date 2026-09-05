import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import type { EntityId } from '@core/models/common.model';
import { formatMoney } from '@core/utils/money.util';
import type {
  CashSessionRow,
  CashSessionStatus,
  CashSessionsPage,
} from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type { DataTableSection } from '@shared/components/data-table/data-table.model';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { NavTabsComponent } from '@shared/components/nav-tabs/nav-tabs.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import { colonnaVisibile } from '@shared/models/list-card-fields.util';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';

import {
  CASH_SESSIONS_COLUMN_DEFS,
  CASH_SESSIONS_COLUMN_PRESETS,
} from '../models/cash-register-columns.config';
import { CASH_TABS } from '../models/cash-nav';

/**
 * L'elenco delle **sessioni di cassa**: aperte e chiuse, con quanto e' passato
 * dal cassetto.
 *
 * ⭐ **Sul telaio e sul motore comuni dal 04/09/2026**, come il registro delle
 * operazioni: erano dieci `<th>` scritti a mano, senza selettore Colonne, senza
 * larghezze regolabili e senza vista a card.
 *
 * ⛔ **Senza riga totali, e non per dimenticanza**: l'API delle sessioni non
 * restituisce un riepilogo di periodo, e l'elenco ne chiede cento per volta.
 * Sommare le righe in mano darebbe il totale della PAGINA — «il riepilogo
 * SOMMA, non ricalcola» vale anche a non inventare la somma sbagliata.
 */
@Component({
  selector: 'app-cash-sessions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BadgeComponent,
    DataTableCellDirective,
    DataTableComponent,
    DataTableRowCardDirective,
    DateInputComponent,
    ListPageComponent,
    NavTabsComponent,
    SelectMenuComponent,
  ],
  templateUrl: './cash-sessions.component.html',
  styleUrl: './cash-sessions.component.scss',
})
export class CashSessionsComponent {
  private readonly api = inject(CashApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sedi = inject(OperationalLocationsService);
  private readonly router = inject(Router);
  private readonly preferenzeColonne = inject(TableColumnPreferenceService);

  /** ⭐ Le tre aree della Cassa: dichiarate una volta, usate da entrambi i registri. */
  protected readonly schede = CASH_TABS;

  protected readonly vista = TableViewId.CashSessions;

  protected readonly pagina = signal<CashSessionsPage | null>(null);
  protected readonly caricamento = signal(false);
  protected readonly errore = signal<string | null>(null);

  protected readonly da = signal('');
  protected readonly a = signal('');
  protected readonly sedeId = signal<EntityId | null>(null);
  protected readonly stato = signal<CashSessionStatus | null>(null);

  protected readonly statiSelezionabili = [
    { value: 'open', label: 'Aperte' },
    { value: 'closed', label: 'Chiuse' },
  ];

  protected readonly sediSelezionabili = computed(() =>
    this.sedi.locations().map((l) => ({ value: l.id, label: l.name })),
  );

  protected readonly colonneVisibili: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  /** Come nel registro operazioni: i filtri di colonna sono quelli comuni. */
  protected readonly righeFiltrate = createColumnFilters<CashSessionRow>({
    viewId: () => this.vista,
    righe: () => this.pagina()?.items ?? [],
    cellText: (riga, colonna) => this.cellText(riga, colonna),
    numeroDi: (riga, colonna) => {
      switch (colonna) {
        case 'float':
          return riga.openingFloatMinor;
        case 'deposits':
          return riga.depositsMinor;
        case 'withdrawals':
          return riga.withdrawalsMinor;
        default:
          return null;
      }
    },
    dataDi: (riga, colonna) => {
      if (colonna === 'openedAt') {
        return riga.openedAt;
      }
      return colonna === 'closedAt' ? riga.closedAt : null;
    },
  });

  protected readonly sezioni = computed<readonly DataTableSection<CashSessionRow>[]>(() => [
    { id: 'tutte', rows: this.righeFiltrate() },
  ]);

  protected readonly vuoto = computed(
    () => !this.caricamento() && !this.errore() && (this.pagina()?.items.length ?? 0) === 0,
  );

  protected readonly filtriAttivi = computed(
    () =>
      (this.da() ? 1 : 0) + (this.a() ? 1 : 0) + (this.sedeId() ? 1 : 0) + (this.stato() ? 1 : 0),
  );

  constructor() {
    this.preferenzeColonne.registerView(
      this.vista,
      CASH_SESSIONS_COLUMN_DEFS,
      CASH_SESSIONS_COLUMN_PRESETS,
    );
    this.colonneVisibili = this.preferenzeColonne.visibleColumns(this.vista);

    this.carica();
  }

  protected carica(): void {
    this.caricamento.set(true);
    this.errore.set(null);
    this.api
      .sessions({
        page: 1,
        // ⭐ Stesso tetto del registro operazioni (`cash-session.dto`).
        pageSize: 5_000,
        from: this.da() || undefined,
        to: this.a() || undefined,
        locationId: this.sedeId() ?? undefined,
        status: this.stato() ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.pagina.set(p);
          this.caricamento.set(false);
        },
        error: () => {
          this.pagina.set(null);
          this.errore.set('Non è stato possibile leggere le sessioni.');
          this.caricamento.set(false);
        },
      });
  }

  protected azzera(): void {
    this.da.set('');
    this.a.set('');
    this.sedeId.set(null);
    this.stato.set(null);
    this.carica();
  }

  // ── Presentazione ────────────────────────────────────────────────────────

  protected readonly rowId = (riga: CashSessionRow): string => riga.id;

  protected readonly rowLabel = (riga: CashSessionRow): string =>
    `Apri la sessione di ${riga.locationName}`;

  protected apri(riga: CashSessionRow): void {
    void this.router.navigate(['/app/cassa/sessioni', riga.id]);
  }

  protected visibile(id: string): boolean {
    return colonnaVisibile(this.colonneVisibili(), id);
  }

  protected readonly cellText = (riga: CashSessionRow, colonna: string): string => {
    switch (colonna) {
      case 'openedAt':
        return formattaIstante(riga.openedAt);
      case 'location':
        return riga.locationName;
      case 'openedBy':
        return riga.openedByName;
      case 'status':
        return riga.status === 'open' ? 'Aperta' : 'Chiusa';
      case 'float':
        return this.soldi(riga.openingFloatMinor);
      case 'sales':
        return `${riga.saleCount} · ${this.soldi(riga.salesTotalMinor)}`;
      case 'returns':
        return `${riga.returnCount} · ${this.soldi(riga.returnsTotalMinor)}`;
      case 'deposits':
        return this.soldi(riga.depositsMinor);
      case 'withdrawals':
        return this.soldi(riga.withdrawalsMinor);
      case 'closedAt':
        return riga.closedAt
          ? `${formattaIstante(riga.closedAt)} · ${riga.closedByName ?? ''}`
          : '—';
      default:
        return '';
    }
  };

  protected soldi(minor: number): string {
    return formatMoney({ amountMinor: minor, currencyCode: 'EUR' });
  }
}

/** Come nel registro operazioni: il testo di una cella lo produce `cellText`. */
function formattaIstante(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '—';
  }
  const due = (n: number): string => String(n).padStart(2, '0');
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()} ${due(d.getHours())}:${due(d.getMinutes())}`;
}
