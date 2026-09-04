import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component,
  DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal  } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { formatMoney } from '@core/utils/money.util';
import type { CashCloseResult, CashSessionDetail } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { MoneyInputComponent } from '@shared/components/money-input/money-input.component';

/**
 * La **chiusura cieca** (`docs/25` §9, §13-quinquies).
 *
 * ⛔ **Prima si conta, poi si vede.** Questa schermata non mostra nessun atteso
 * finché l'operatore non ha dichiarato quanto ha contato e la chiusura non è
 * confermata: gli attesi non esistono proprio, e nessuna rotta li calcola
 * prima. Un conteggio fatto sapendo il risultato non è un conteggio.
 *
 * ⛔ **E non ricalcola niente**: attesi, differenze e addendi arrivano dalla
 * risposta del server.
 */
@Component({
  selector: 'app-cash-closing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackButtonComponent,
    ButtonComponent,
    DatePipe,
    ErrorStateComponent,
    FormsModule,
    InlineBannerComponent,
    MoneyInputComponent,
    RouterLink,
  ],
  templateUrl: './cash-closing.component.html',
  styleUrl: './cash-closing.component.scss',
})
export class CashClosingComponent {
  private readonly api = inject(CashApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly id = computed(() => this.params().get('id') ?? '');

  protected readonly sessione = signal<CashSessionDetail | null>(null);
  protected readonly caricamento = signal(true);
  protected readonly errore = signal<string | null>(null);

  protected readonly contato = signal<number | null>(null);
  protected readonly elettronico = signal<number | null>(null);
  protected readonly riconcilia = signal(false);
  protected readonly note = signal('');
  protected readonly invio = signal(false);

  /** ⭐ L'esito: è QUI che gli attesi compaiono per la prima volta. */
  protected readonly esito = signal<CashCloseResult | null>(null);

  protected readonly puoChiudere = computed(
    () => !!this.sessione() && this.contato() !== null && this.contato()! >= 0 && !this.invio(),
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
    this.api.session(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

  protected chiudi(): void {
    const s = this.sessione();
    const contato = this.contato();
    if (!s || contato === null || !this.puoChiudere()) {
      return;
    }
    this.invio.set(true);
    this.errore.set(null);
    this.api
      .close(s.locationId, s.id, {
        countedCashMinor: contato,
        // ⛔ `null` è una chiusura legittima: significa «non riconciliato».
        declaredElectronicMinor: this.riconcilia() ? (this.elettronico() ?? 0) : null,
        notes: this.note().trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (r) => {
          this.esito.set(r);
          this.invio.set(false);
        },
        error: (e: unknown) => {
          this.errore.set(messaggio(e, 'La cassa non è stata chiusa.'));
          this.invio.set(false);
        },
      });
  }

  protected soldi(minor: number): string {
    return formatMoney({ amountMinor: minor, currencyCode: 'EUR' });
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
