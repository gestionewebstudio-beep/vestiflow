import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Subscription } from 'rxjs';
import { catchError, of } from 'rxjs';

import type { EntityId } from '@core/models/common.model';
import type { Money } from '@core/models/money.model';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { formatDate, formatDateTime } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import type { CashSessionSummary } from './models/cash-session.model';
import { CashSessionsService } from './services/cash-sessions.service';

/**
 * Chiusure di cassa (Tranche 1.2): l'elenco delle sessioni — aperte e chiuse —
 * con incassi per metodo, conteggi e differenze. La sessione chiusa mostra gli
 * attesi CONGELATI alla chiusura: è storico, non un ricalcolo.
 */
@Component({
  selector: 'app-cash-sessions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SelectMenuComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './cash-sessions-page.component.html',
  styleUrl: './cash-sessions-page.component.scss',
})
export class CashSessionsPageComponent {
  private readonly service = inject(CashSessionsService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly sessions = signal<readonly CashSessionSummary[]>([]);

  protected readonly locationFilter = signal<EntityId | null>(null);
  protected readonly fromDraft = signal('');
  protected readonly toDraft = signal('');
  /** Riga espansa: movimenti di cassetto e note della sessione. */
  protected readonly expandedId = signal<EntityId | null>(null);

  protected readonly locationOptions = computed((): readonly SelectMenuOption[] =>
    this.operationalLocations.locations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  protected readonly hasActiveFilters = computed(
    () => !!this.locationFilter() || !!this.fromDraft() || !!this.toDraft(),
  );

  private listSubscription: Subscription | null = null;

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.listSubscription = this.service
      .list({
        locationId: this.locationFilter() ?? undefined,
        from: this.fromDraft() ? new Date(this.fromDraft()).toISOString() : undefined,
        // «Al» incluso: la data del filtro copre l'intera giornata.
        to: this.toDraft() ? `${this.toDraft()}T23:59:59.999Z` : undefined,
      })
      .pipe(
        catchError(() => {
          this.loadError.set(true);
          return of([] as readonly CashSessionSummary[]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((sessions) => {
        this.loading.set(false);
        this.sessions.set(sessions);
      });
  }

  protected onLocationFilterChange(value: string | null): void {
    this.locationFilter.set(value || null);
    this.reload();
  }

  protected onFromInput(event: Event): void {
    this.fromDraft.set((event.target as HTMLInputElement).value);
    this.reload();
  }

  protected onToInput(event: Event): void {
    this.toDraft.set((event.target as HTMLInputElement).value);
    this.reload();
  }

  protected clearFilters(): void {
    this.locationFilter.set(null);
    this.fromDraft.set('');
    this.toDraft.set('');
    this.reload();
  }

  protected toggleExpanded(id: EntityId): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  /** Differenza contanti (contato − atteso); null finché la sessione è aperta. */
  protected cashDifference(session: CashSessionSummary): number | null {
    return session.status === 'closed' && session.countedCashMinor != null
      ? session.countedCashMinor - session.expectedCashMinor
      : null;
  }

  protected money(amountMinor: number): string {
    const money: Money = { amountMinor, currencyCode: 'EUR' };
    return formatMoney(money);
  }
}
