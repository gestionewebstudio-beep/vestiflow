import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component,
  DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { EntityId } from '@core/models/common.model';
import { formatMoney } from '@core/utils/money.util';
import type { CashSessionStatus, CashSessionsPage } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';

/**
 * Le **sessioni di cassa**: aperte e chiuse, su tutte le sedi in perimetro.
 *
 * ⛔ **Gli attesi non compaiono qui**, e non è una scelta di layout: finché una
 * sessione è aperta non esistono. La chiusura è cieca.
 */
@Component({
  selector: 'app-cash-sessions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    DatePipe,
    EmptyStateComponent,
    ErrorStateComponent,
    FormsModule,
    RouterLink,
    SelectMenuComponent,
  ],
  templateUrl: './cash-sessions.component.html',
  styleUrl: './cash-sessions.component.scss',
})
export class CashSessionsComponent {
  private readonly api = inject(CashApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sedi = inject(OperationalLocationsService);

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

  constructor() {
    this.carica();
  }

  protected carica(): void {
    this.caricamento.set(true);
    this.errore.set(null);
    this.api
      .sessions({
        page: 1,
        pageSize: 100,
        from: this.da() || undefined,
        to: this.a() || undefined,
        locationId: this.sedeId() ?? undefined,
        status: this.stato() ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

  protected soldi(minor: number): string {
    return formatMoney({ amountMinor: minor, currencyCode: 'EUR' });
  }
}
