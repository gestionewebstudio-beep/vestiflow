import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Router } from '@angular/router';

import type { EntityId } from '@core/models/common.model';
import { formatMoney } from '@core/utils/money.util';
import type {
  CashSessionRow,
  CashSessionStatus,
  CashSessionsPage,
} from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import {
  MOVEMENT_PERIOD_OPTIONS,
  MovementPeriodPreset,
  resolveMovementPeriodRange,
} from '@domain/inventory/models/movement-period.util';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { NavTabsComponent } from '@shared/components/nav-tabs/nav-tabs.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import { colonnaVisibile } from '@shared/models/list-card-fields.util';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';

import {
  CASH_SESSIONS_COLUMN_DEFS,
  CASH_SESSIONS_COLUMN_PRESETS,
} from '../models/cash-register-columns.config';

import { CASH_TABS } from '../models/cash-nav';

interface StatoSessioni {
  readonly pagina: CashSessionsPage | null;
  readonly caricamento: boolean;
  readonly errore: string | null;
}

const IN_ATTESA: StatoSessioni = { pagina: null, caricamento: true, errore: null };

/**
 * L'elenco delle **sessioni di cassa**: aperte e chiuse, con quanto e' passato
 * dal cassetto.
 *
 * ⭐ **Sul telaio e sul motore comuni dal 04/09/2026**, come il registro delle
 * operazioni: erano dieci `<th>` scritti a mano, senza selettore Colonne, senza
 * larghezze regolabili e senza vista a card.
 *
 * ⭐ **Con la riga totali dal 05/09/2026.** Qui c'era scritto che non poteva
 * averla perche' «l'API non restituisce un riepilogo di periodo e l'elenco ne
 * chiede cento per volta»: la seconda meta` non vale piu`, e la somma delle
 * righe in mano **e` la somma del filtro**.
 *
 * ⛔ **La quadratura resta fuori**: attesi e differenze esistono solo a
 * sessione chiusa, e sommarli significherebbe trasformare un valore non
 * disponibile in zero.
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

  private readonly rilettura = signal(0);

  private readonly richiesta = computed(() => ({
    from: this.da() || undefined,
    to: this.a() || undefined,
    locationId: this.sedeId() ?? undefined,
    status: this.stato() ?? undefined,
    giro: this.rilettura(),
  }));

  /**
   * ⛔ **UNA richiesta alla volta, e vince l'ULTIMA CHIESTA** — come nel
   * registro operazioni: `carica()` apriva una sottoscrizione nuova senza
   * chiudere la precedente, e a vincere era la risposta piu` lenta.
   *
   * ⭐ E chiede `all=1`: tutto il risultato del filtro, non una pagina.
   */
  private readonly statoRichiesta = toSignal(
    toObservable(this.richiesta).pipe(
      switchMap(({ giro: _giro, ...filtri }) =>
        this.api.sessions(filtri, { tutto: true }).pipe(
          map((p): StatoSessioni => ({ pagina: p, caricamento: false, errore: null })),
          catchError(() =>
            of<StatoSessioni>({
              pagina: null,
              caricamento: false,
              errore: 'Non è stato possibile leggere le sessioni.',
            }),
          ),
          startWith(IN_ATTESA),
        ),
      ),
    ),
    { initialValue: IN_ATTESA },
  );

  protected readonly pagina = computed(() => this.statoRichiesta().pagina);
  protected readonly caricamento = computed(() => this.statoRichiesta().caricamento);
  protected readonly errore = computed(() => this.statoRichiesta().errore);

  /**
   * ⛔ **Nessun periodo predefinito, e non è una dimenticanza.**
   *
   * Il registro filtra su `openedAt`: con «Oggi» una sessione **aperta ieri e
   * ancora aperta** sparirebbe dall'elenco proprio mentre ci si lavora dentro.
   * L'alternativa — «oggi PIÙ quelle ancora aperte» — sarebbe un filtro con
   * un'eccezione nascosta, che è peggio di nessun filtro: chi legge «Oggi» non
   * si aspetta righe di ieri.
   *
   * ⚠️ **Il selettore c'è comunque**, con lo stesso elenco condiviso del
   * registro operazioni: quello che manca è il valore iniziale, non lo
   * strumento.
   */
  protected readonly periodOptions = MOVEMENT_PERIOD_OPTIONS;
  protected readonly periodo = signal<MovementPeriodPreset>(MovementPeriodPreset.All);

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
    numeroDi: (riga, colonna) => this.numeroDi(riga, colonna),
    dataDi: (riga, colonna) => this.dataDi(riga, colonna),
  });

  /**
   * ⭐ **L'ordinamento e` sull'intero risultato**, non su una pagina: da quando
   * l'elenco arriva con `all=1`, ordinarlo in memoria e` onesto.
   */
  protected readonly ordine = signal<readonly DataTableSort[]>([]);

  private readonly righeOrdinate = computed(() =>
    ordinaPerColonne(this.righeFiltrate(), this.ordine(), {
      cellText: (riga, colonna) => this.cellText(riga, colonna),
      numeroDi: (riga, colonna) => this.numeroDi(riga, colonna),
      dataDi: (riga, colonna) => this.dataDi(riga, colonna),
    }),
  );

  protected readonly sezioni = computed<readonly DataTableSection<CashSessionRow>[]>(() => [
    { id: 'tutte', rows: this.righeOrdinate() },
  ]);

  /**
   * ⭐ **La riga totali delle Sessioni**, con la primitiva condivisa
   * `totaliDiElenco` — la stessa dei prodotti e delle giacenze.
   *
   * ⛔ **Era assente**, e la motivazione era vera quando fu scritta: «l_API
   * non restituisce un riepilogo di periodo, e sommare le cento righe
   * caricate darebbe il totale della PAGINA». Da quando arriva tutto il
   * risultato del filtro, quella somma **e` il totale del filtro**.
   *
   * ⚠️ **Tre ambiti, e non vanno confusi:**
   *
   * ```text
   * riepilogo del PERIODO   non esiste per le sessioni, e non si inventa
   * righe FILTRATE          quello che si somma qui, quando non c_e` selezione
   * SELEZIONE               quando ci sono righe scelte: lo fa la primitiva
   * ```
   *
   * ⛔ **Non si somma la QUADRATURA.** Differenze e attesi vivono in
   * `frozen`, esistono solo a sessione chiusa e sono `null` finche` e` aperta:
   * sommarli significherebbe **trasformare un valore non disponibile in
   * zero**, cioe` affermare una quadratura che nessuno ha calcolato. La
   * quadratura si legge nel dettaglio, dove il server la fornisce.
   *
   * ⚠️ **Vendite e Resi sommano il DENARO, non il conteggio**: la cella porta
   * due grandezze («3 · 45,00 €») e una riga totali ne puo` mostrare una. Si
   * somma quella additiva e omogenea alla colonna — gli importi. Il numero di
   * sessioni lo dice gia` «N voci» a sinistra.
   */
  protected readonly totali = computed<DataTableTotals>(() =>
    totaliDiElenco(this.righeOrdinate(), {
      rowId: this.rowId,
      selectedIds: new Set<string>(),
      columns: this.colonneVisibili(),
      campi: {
        float: { valore: (r) => r.openingFloatMinor, formato: (n) => this.soldi(n) },
        sales: { valore: (r) => r.salesTotalMinor, formato: (n) => this.soldi(n) },
        returns: { valore: (r) => r.returnsTotalMinor, formato: (n) => this.soldi(n) },
        deposits: { valore: (r) => r.depositsMinor, formato: (n) => this.soldi(n) },
        withdrawals: { valore: (r) => r.withdrawalsMinor, formato: (n) => this.soldi(n) },
      },
    }),
  );

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
  }

  /** Rilegge senza toccare i filtri: e` il gesto di «Riprova». */
  protected carica(): void {
    this.rilettura.update((n) => n + 1);
  }

  /** Stessa meccanica del registro operazioni: il preset diventa due date. */
  protected cambiaPeriodo(preset: string): void {
    const scelto = preset as MovementPeriodPreset;
    this.periodo.set(scelto);
    if (scelto === MovementPeriodPreset.Custom) {
      return;
    }
    const intervallo = resolveMovementPeriodRange(scelto, this.da(), this.a());
    this.da.set(intervallo.from ?? '');
    this.a.set(intervallo.to ?? '');
    this.carica();
  }

  protected cambiaData(quale: 'da' | 'a', valore: string): void {
    (quale === 'da' ? this.da : this.a).set(valore);
    this.periodo.set(MovementPeriodPreset.Custom);
    this.carica();
  }

  /**
   * Gli estrattori, in un posto solo: li usano i filtri di colonna E
   * l'ordinamento. Sono le stesse tre funzioni con cui la tabella si disegna.
   */
  private numeroDi(riga: CashSessionRow, colonna: string): number | null {
    switch (colonna) {
      case 'float':
        return riga.openingFloatMinor;
      case 'sales':
        return riga.salesTotalMinor;
      case 'returns':
        return riga.returnsTotalMinor;
      case 'deposits':
        return riga.depositsMinor;
      case 'withdrawals':
        return riga.withdrawalsMinor;
      default:
        return null;
    }
  }

  private dataDi(riga: CashSessionRow, colonna: string): string | null {
    if (colonna === 'openedAt') {
      return riga.openedAt;
    }
    return colonna === 'closedAt' ? riga.closedAt : null;
  }
  protected azzera(): void {
    this.da.set('');
    this.a.set('');
    this.sedeId.set(null);
    this.stato.set(null);
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
