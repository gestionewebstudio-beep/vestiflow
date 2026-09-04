import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component,
  DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal  } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '@core/auth';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { hasTenantPermission } from '@core/permissions/user-permissions.util';
import { formatMoney } from '@core/utils/money.util';
import type { CashOperationDetail } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';

/**
 * Il dettaglio di un'operazione di Cassa: righe, quote, resto, movimenti,
 * sessione, collegamenti.
 *
 * ⛔ **Nessuna modifica e nessuna cancellazione.** Una vendita di Cassa conclusa
 * non si riapre: si corregge con un RESO, che è un documento nuovo e collegato.
 * Non esiste una rotta che la riporti in modifica.
 */
@Component({
  selector: 'app-cash-operation-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, DatePipe, ErrorStateComponent, RouterLink],
  templateUrl: './cash-operation-detail.component.html',
  styleUrl: './cash-operation-detail.component.scss',
})
export class CashOperationDetailComponent {
  private readonly api = inject(CashApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly id = computed(() => this.params().get('id') ?? '');

  protected readonly operazione = signal<CashOperationDetail | null>(null);
  protected readonly errore = signal<string | null>(null);
  protected readonly caricamento = signal(true);

  /**
   * ⛔ **L'azione compare solo con il permesso**: l'interfaccia non mostra ciò
   * che l'API rifiuterebbe.
   */
  protected readonly puoRendere = computed(() =>
    hasTenantPermission(this.auth.currentUser(), TenantPermission.RetailCashReturn),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) {
        this.carica(id);
      }
    });
  }

  protected ricarica(): void {
    this.carica(this.id());
  }

  private carica(id: string): void {
    this.caricamento.set(true);
    this.errore.set(null);
    this.api.operation(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (o) => {
        this.operazione.set(o);
        this.caricamento.set(false);
      },
      error: () => {
        this.operazione.set(null);
        this.errore.set('Operazione non trovata, o fuori dal tuo perimetro.');
        this.caricamento.set(false);
      },
    });
  }

  protected soldi(minor: number): string {
    return formatMoney({ amountMinor: minor, currencyCode: 'EUR' });
  }
}
