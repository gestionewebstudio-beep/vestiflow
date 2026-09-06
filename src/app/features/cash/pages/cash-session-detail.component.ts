import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '@core/auth';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { hasTenantPermission } from '@core/permissions/user-permissions.util';
import { formatMoney } from '@core/utils/money.util';
import type { CashMovementType, CashSessionDetail } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { FormSectionComponent } from '@shared/components/form-section/form-section.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { MoneyInputComponent } from '@shared/components/money-input/money-input.component';

/**
 * Il dettaglio di una sessione: quadratura, movimenti, documenti, dispositivo.
 *
 * ⛔ **La quadratura non si ricalcola qui.** Gli attesi congelati arrivano dal
 * server; gli addendi sono una RICOSTRUZIONE dichiarata, e se non tornano col
 * congelato la schermata lo dice — succede annullando un documento dopo la
 * chiusura.
 */
@Component({
  selector: 'app-cash-session-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackButtonComponent,
    ButtonComponent,
    DatePipe,
    ErrorStateComponent,
    FormSectionComponent,
    FormsModule,
    InlineBannerComponent,
    MoneyInputComponent,
    RouterLink,
  ],
  templateUrl: './cash-session-detail.component.html',
  styleUrl: './cash-session-detail.component.scss',
})
export class CashSessionDetailComponent {
  private readonly api = inject(CashApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly id = computed(() => this.params().get('id') ?? '');

  protected readonly sessione = signal<CashSessionDetail | null>(null);
  protected readonly errore = signal<string | null>(null);
  protected readonly caricamento = signal(true);

  // ── Cassetto ─────────────────────────────────────────────────────────────
  protected readonly tipoMovimento = signal<CashMovementType>('deposit');
  protected readonly importoMovimento = signal<number | null>(null);
  protected readonly causale = signal('');
  protected readonly invioMovimento = signal(false);

  /** ⛔ Le azioni compaiono solo con il permesso che l'API pretende. */
  protected readonly puoMuovereCassetto = computed(() =>
    hasTenantPermission(this.auth.currentUser(), TenantPermission.RetailCashDrawer),
  );
  protected readonly puoChiudere = computed(() =>
    hasTenantPermission(this.auth.currentUser(), TenantPermission.RetailCashSession),
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
    this.api
      .session(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.sessione.set(s);
          this.caricamento.set(false);
        },
        error: () => {
          this.sessione.set(null);
          this.errore.set('Sessione non trovata, o fuori dal tuo perimetro.');
          this.caricamento.set(false);
        },
      });
  }

  protected registraMovimento(): void {
    const s = this.sessione();
    const importo = this.importoMovimento();
    if (!s || !importo || importo <= 0 || !this.causale().trim()) {
      return;
    }
    this.invioMovimento.set(true);
    this.api
      .addMovement(s.locationId, s.id, {
        type: this.tipoMovimento(),
        amountMinor: importo,
        reason: this.causale().trim(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.importoMovimento.set(null);
          this.causale.set('');
          this.invioMovimento.set(false);
          this.ricarica();
        },
        error: (e: unknown) => {
          this.errore.set(messaggio(e, 'Il movimento non è stato registrato.'));
          this.invioMovimento.set(false);
        },
      });
  }

  protected soldi(minor: number): string {
    return formatMoney({ amountMinor: minor, currencyCode: 'EUR' });
  }

  protected etichettaMovimento(tipo: string): string {
    return tipo === 'deposit' ? 'Versamento' : 'Prelievo';
  }
}

function messaggio(errore: unknown, riserva: string): string {
  const corpo = (errore as { error?: { message?: string | string[] } } | null)?.error;
  const testo = corpo?.message;
  if (Array.isArray(testo)) {
    return testo.join(' · ');
  }
  return testo ?? riserva;
}
