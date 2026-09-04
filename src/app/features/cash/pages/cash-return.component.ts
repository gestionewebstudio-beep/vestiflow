import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component,
  DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal  } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import type { EntityId } from '@core/models/common.model';
import { formatMoney } from '@core/utils/money.util';
import { nuovoId } from '@core/utils/uuid.util';
import type { CashSessionState, ReturnLookup } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { MoneyInputComponent } from '@shared/components/money-input/money-input.component';

/**
 * Il **reso collegato allo scontrino** (`docs/25` §12-bis).
 *
 * ⛔ **Non esiste un reso libero.** Si parte sempre da una vendita identificata:
 * questa schermata riceve il documento richiamato, mostra cosa è stato
 * comprato, quanto è già stato reso e quanto è ancora rendibile.
 *
 * ⭐ **Il rimborso si compone sulle QUOTE dell'incasso originale**, non sui Tipi
 * pagamento: due quote possono avere lo stesso Tipo, e il Tipo può non esistere
 * più. È quello che il server pretende, ed è quello che la schermata offre.
 *
 * ⛔ **Nessun calcolo autorevole qui**: gli importi proposti sono proporzionali
 * alla quantità resa, ma a decidere è il server.
 */
@Component({
  selector: 'app-cash-return',
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
  templateUrl: './cash-return.component.html',
  styleUrl: './cash-return.component.scss',
})
export class CashReturnComponent {
  private readonly api = inject(CashApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly documentId = computed(() => this.params().get('id') ?? '');

  protected readonly vendita = signal<ReturnLookup | null>(null);
  protected readonly stato = signal<CashSessionState | null>(null);
  protected readonly errore = signal<string | null>(null);
  protected readonly caricamento = signal(true);
  protected readonly invio = signal(false);
  protected readonly fatto = signal<{ reference: string; totalMinor: number } | null>(null);

  protected readonly sedeId = signal<EntityId | null>(null);
  protected readonly motivo = signal('');
  protected readonly quantita = signal<Record<string, number>>({});
  protected readonly rimborsi = signal<Record<string, number>>({});
  protected readonly confermati = signal<Record<string, boolean>>({});

  protected readonly sessione = computed(() => this.stato()?.session ?? null);

  /** Il totale del reso: proporzionale sulla riga originale. È un'anteprima. */
  protected readonly totaleMinor = computed(() => {
    const v = this.vendita();
    if (!v) {
      return 0;
    }
    return v.lines.reduce((tot, riga) => {
      const resa = this.quantita()[riga.lineId] ?? 0;
      if (resa <= 0 || riga.quantitySold === 0) {
        return tot;
      }
      return tot + Math.round((riga.lineGrossTotalMinor * resa) / riga.quantitySold);
    }, 0);
  });

  protected readonly rimborsatoMinor = computed(() =>
    Object.values(this.rimborsi()).reduce((tot, v) => tot + (v || 0), 0),
  );

  protected readonly puoConfermare = computed(
    () =>
      !!this.sessione() &&
      this.totaleMinor() > 0 &&
      this.rimborsatoMinor() === this.totaleMinor() &&
      this.motivo().trim().length > 0 &&
      !this.invio(),
  );

  constructor() {
    effect(() => {
      const id = this.documentId();
      if (id) {
        this.carica(id);
      }
    });
  }

  protected ricarica(): void {
    this.carica(this.documentId());
  }

  private carica(documentId: string): void {
    this.caricamento.set(true);
    this.errore.set(null);
    // La sede del reso è quella CORRENTE, e la si ricava dall'operazione
    // richiamata solo per leggerla: la merce rientra dove viene riportata.
    this.api.operation(documentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (op) => {
        const sede = op.locationId;
        this.sedeId.set(sede);
        if (!sede) {
          this.errore.set('La vendita non ha una sede: non si può rendere.');
          this.caricamento.set(false);
          return;
        }
        this.api.current(sede).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (s) => this.stato.set(s),
          error: () => this.stato.set(null),
        });
        this.api.lookupReturn(sede, documentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (v) => {
            this.vendita.set(v);
            this.caricamento.set(false);
          },
          error: (e: unknown) => {
            this.vendita.set(null);
            this.errore.set(messaggio(e, 'Non è stato possibile richiamare la vendita.'));
            this.caricamento.set(false);
          },
        });
      },
      error: () => {
        this.errore.set('Vendita non trovata, o fuori dal tuo perimetro.');
        this.caricamento.set(false);
      },
    });
  }

  protected cambiaQuantita(lineId: EntityId, valore: number, massimo: number): void {
    const q = Math.max(0, Math.min(Math.floor(valore || 0), massimo));
    this.quantita.set({ ...this.quantita(), [lineId]: q });
  }

  protected cambiaRimborso(paymentId: EntityId, valore: number | null): void {
    this.rimborsi.set({ ...this.rimborsi(), [paymentId]: valore ?? 0 });
  }

  protected cambiaConferma(paymentId: EntityId, valore: boolean): void {
    this.confermati.set({ ...this.confermati(), [paymentId]: valore });
  }

  /** Propone il rimborso sulla prima quota capiente: quasi sempre è quello. */
  protected proponiRimborso(): void {
    const v = this.vendita();
    if (!v) {
      return;
    }
    let residuo = this.totaleMinor();
    const proposta: Record<string, number> = {};
    for (const quota of v.payments) {
      if (residuo <= 0) {
        break;
      }
      const quantita = Math.min(residuo, quota.amountMinor);
      proposta[quota.paymentId] = quantita;
      residuo -= quantita;
    }
    this.rimborsi.set(proposta);
  }

  protected conferma(): void {
    const v = this.vendita();
    const sede = this.sedeId();
    const sessione = this.sessione();
    if (!v || !sede || !sessione || !this.puoConfermare()) {
      return;
    }
    this.invio.set(true);
    this.errore.set(null);

    this.api
      .createReturn({
        locationId: sede,
        sessionId: sessione.id,
        originalDocumentId: v.documentId,
        // ⛔ `nuovoId()`: in magazzino la pagina non è in contesto sicuro.
        creationIntentId: nuovoId(),
        reason: this.motivo().trim(),
        lines: Object.entries(this.quantita())
          .filter(([, q]) => q > 0)
          .map(([originalLineId, quantity]) => ({ originalLineId, quantity })),
        refunds: Object.entries(this.rimborsi())
          .filter(([, importo]) => importo > 0)
          .map(([originalPaymentId, amountMinor]) => ({
            originalPaymentId,
            amountMinor,
            confirmed: this.confermati()[originalPaymentId] ?? false,
          })),
      })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (esito) => {
          this.fatto.set({ reference: esito.reference, totalMinor: esito.totaleMinor });
          this.invio.set(false);
        },
        error: (e: unknown) => {
          this.errore.set(messaggio(e, 'Il reso non è stato registrato.'));
          this.invio.set(false);
        },
      });
  }

  protected tornaAlleOperazioni(): void {
    void this.router.navigate(['/app/cassa/operazioni']);
  }

  protected soldi(minor: number): string {
    return formatMoney({ amountMinor: minor, currencyCode: 'EUR' });
  }

  protected quantitaDi(lineId: EntityId): number {
    return this.quantita()[lineId] ?? 0;
  }

  protected rimborsoDi(paymentId: EntityId): number {
    return this.rimborsi()[paymentId] ?? 0;
  }

  protected confermaDi(paymentId: EntityId): boolean {
    return this.confermati()[paymentId] ?? false;
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
