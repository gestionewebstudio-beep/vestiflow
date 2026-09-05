import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { formatMoney } from '@core/utils/money.util';
import type { CashIntentResult } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';

import {
  CashPendingOperationsService,
  type CashPendingEvidence,
  type CashPendingOperation,
} from '../services/cash-pending-operations.service';

type Recorded = Extract<CashIntentResult, { status: 'recorded' }>;
interface Verified {
  evidence: CashPendingEvidence;
  result: Recorded;
  opened: boolean;
}

/** Recupero in sola lettura, comune ai due invii Cassa. Non ricostruisce comandi. */
@Component({
  selector: 'app-cash-pending-recovery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, InlineBannerComponent, DatePipe, RouterLink],
  templateUrl: './cash-pending-recovery.component.html',
  styleUrl: './cash-pending-recovery.component.scss',
})
export class CashPendingRecoveryComponent {
  readonly operation = input.required<CashPendingOperation>();
  readonly disabled = input(false);
  readonly recovered = output<Recorded>();
  private readonly pending = inject(CashPendingOperationsService);
  private readonly api = inject(CashApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly checkout = this.pending.watch('checkout');
  private readonly returns = this.pending.watch('returns');
  protected readonly state = computed(() =>
    this.operation() === 'checkout' ? this.checkout() : this.returns(),
  );
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  private readonly verification = signal<Verified | null>(null);
  protected readonly verified = computed(() => {
    const value = this.verification();
    return value && this.current(value.evidence) ? value : null;
  });
  private readonly closedEvidence = signal<CashPendingEvidence | null>(null);
  protected readonly closed = computed(() => {
    const evidence = this.closedEvidence();
    return evidence && this.pending.owns(evidence) && evidence.key.endsWith(`:${this.operation()}`)
      ? evidence
      : null;
  });

  protected refresh(): void {
    this.verification.set(null);
    this.message.set(null);
    this.pending.refresh();
  }

  protected async verify(): Promise<void> {
    const evidence = this.state().evidence;
    if (this.busy() || this.disabled() || !evidence?.intentId) return;
    this.busy.set(true);
    this.verification.set(null);
    this.message.set(null);
    try {
      const result = await this.lookup(evidence);
      if (!this.current(evidence)) return;
      if (result.status === 'recorded') this.verification.set({ evidence, result, opened: false });
      else
        this.message.set(
          'Esito non confermato. L’intento potrebbe essere ancora in corso o non essere disponibile: questo non dimostra che l’operazione non sia stata registrata.',
        );
    } catch {
      this.message.set(
        'Esito non confermato. Verifica non disponibile o accesso alla sede non consentito. I dati locali sono conservati.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected compatible(value: Verified): boolean {
    return (
      value.evidence.compatible &&
      value.result.intentId === value.evidence.intentId &&
      value.result.locationId === value.evidence.locationId &&
      value.result.sessionId === value.evidence.sessionId
    );
  }

  /** Il link apre il dettaglio; verifichiamo anche il permesso di consultarlo.
   * Un esito leggibile dal solo permesso resi non amplia l'accesso al registro. */
  protected async opened(value: Verified): Promise<void> {
    if (this.busy() || this.disabled() || !this.current(value.evidence)) return;
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.operation(value.result.documentId).pipe(takeUntilDestroyed(this.destroyRef)),
      );
      if (this.current(value.evidence)) this.verification.set({ ...value, opened: true });
    } catch {
      this.message.set(
        'Apertura non verificata. Occorre poter consultare il documento prima di confermare il recupero.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirm(value: Verified): Promise<void> {
    if (
      this.busy() ||
      this.disabled() ||
      !value.opened ||
      !this.compatible(value) ||
      !this.current(value.evidence)
    )
      return;
    this.busy.set(true);
    this.message.set(null);
    try {
      // Non basta una verifica precedente: sede e autorizzazioni possono essere revocate.
      const result = await this.lookup(value.evidence);
      if (!this.current(value.evidence)) return;
      if (result.status !== 'recorded' || result.documentId !== value.result.documentId) {
        this.verification.set(null);
        this.message.set('Esito non confermato dalla nuova verifica. La pendenza è conservata.');
        return;
      }
      this.pending.acknowledgeRecorded(this.operation(), value.evidence, result);
      this.closedEvidence.set(value.evidence);
      this.verification.set(null);
      this.recovered.emit(result);
    } catch {
      this.verification.set(null);
      this.message.set(
        'Recupero non concluso: verifica accesso alla sede e disponibilità dei dati locali. Rileggi i dati e verifica nuovamente; non ripetere l’operazione.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected money(minor: number): string {
    return formatMoney({ amountMinor: minor, currencyCode: 'EUR' });
  }

  private current(evidence: CashPendingEvidence): boolean {
    const current = this.state().evidence;
    return (
      this.pending.owns(evidence) && current?.key === evidence.key && current.raw === evidence.raw
    );
  }
  private lookup(evidence: CashPendingEvidence): Promise<CashIntentResult> {
    return firstValueFrom(
      this.api
        .intentResult(this.operation(), evidence.intentId!)
        .pipe(takeUntilDestroyed(this.destroyRef)),
    );
  }
}
