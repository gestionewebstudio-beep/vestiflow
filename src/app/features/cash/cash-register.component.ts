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
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { AuthService } from '@core/auth';
import type { EntityId } from '@core/models/common.model';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { formatMoney } from '@core/utils/money.util';
import { isAppError } from '@core/models/app-error.model';
import { nuovoId } from '@core/utils/uuid.util';
import {
  CashTenderSplitComponent,
  type CashQuotaDraft,
} from '@domain/cash/components/cash-tender-split/cash-tender-split.component';
import type { CashCheckoutPayload, CashSessionState } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import type { StoreSaleLookupItem } from '@domain/store-sales/models/store-sale.model';
import { StoreSalesService } from '@domain/store-sales/services/store-sales.service';
import {
  computeVatLineAmounts,
  vatInputFromLegacyRate,
  vatInputFromSnapshot,
} from '@domain/documents/utils/document-vat.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { MoneyInputComponent } from '@shared/components/money-input/money-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';

import { CashPendingOperationsService } from './services/cash-pending-operations.service';

/**
 * La Cassa: **vendita**, stato della sessione, riepilogo (`docs/25` §3).
 *
 * ⭐ **Non è una maschera documentale.** Su scrivania ricerca, carrello e
 * incasso restano visibili insieme: chi sta al banco non naviga fra schede col
 * cliente davanti. Le primitive sono le stesse dei documenti — ricerca
 * articolo, riga, denaro — ma la disposizione è di una cassa.
 *
 * ⛔ **Il frontend calcola solo l'ANTEPRIMA.** Totale, resto e quadratura li
 * decide il server: dopo la conferma la schermata mostra i valori che tornano,
 * non i propri.
 *
 * ⛔ **Nessuna dicitura che faccia credere avvenuta la fiscalizzazione.** C5 non
 * esiste: si dice «Vendita registrata — fiscalizzazione non ancora disponibile
 * in questa versione», e non «scontrino emesso».
 */
@Component({
  selector: 'app-cash-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    CashTenderSplitComponent,
    DatePipe,
    EmptyStateComponent,
    FormsModule,
    InlineBannerComponent,
    MoneyInputComponent,
    RouterLink,
    SelectMenuComponent,
  ],
  templateUrl: './cash-register.component.html',
  styleUrl: './cash-register.component.scss',
})
export class CashRegisterComponent {
  private readonly api = inject(CashApiService);
  private readonly pending = inject(CashPendingOperationsService);
  protected readonly invioPrecedente = this.pending.watch('checkout');
  private readonly destroyRef = inject(DestroyRef);
  private readonly catalogo = inject(StoreSalesService);
  private readonly sedi = inject(OperationalLocationsService);
  private readonly tipiPagamento = inject(PaymentOptionsService);
  private readonly auth = inject(AuthService);

  // ── Stato della schermata ────────────────────────────────────────────────

  protected readonly sedeId = signal<EntityId | null>(null);
  protected readonly stato = signal<CashSessionState | null>(null);
  protected readonly caricamento = signal(false);
  protected readonly errore = signal<string | null>(null);
  protected readonly avvisi = signal<readonly string[]>([]);

  protected readonly ricerca = signal('');
  protected readonly risultati = signal<readonly StoreSaleLookupItem[]>([]);
  protected readonly cercando = signal(false);

  protected readonly righe = signal<readonly CartLine[]>([]);
  protected readonly quote = signal<readonly CashQuotaDraft[]>([]);
  protected readonly quantitaDaCorreggere = computed(() =>
    this.righe().some((r) => this.quantitaValida(r.quantityDraft) === null),
  );

  protected readonly fondoApertura = signal<number | null>(0);
  protected readonly conclusione = signal(false);
  protected readonly conclusa = signal<ConclusaResult | null>(null);
  protected readonly carrelloConservato = signal(false);

  protected readonly opzioni = toSignal(
    this.tipiPagamento.list('method').pipe(catchError(() => of([] as readonly PaymentOption[]))),
    { initialValue: [] as readonly PaymentOption[] },
  );

  protected readonly operatore = computed(() => this.auth.currentUser()?.displayName ?? '');

  protected readonly sediSelezionabili = computed(() =>
    this.sedi.locations().map((l) => ({ value: l.id, label: l.name })),
  );

  protected readonly sessione = computed(() => this.stato()?.session ?? null);

  protected readonly sedeCorrente = computed(() => {
    const id = this.sedeId();
    return this.sedi.locations().find((l) => l.id === id) ?? null;
  });

  /** ⭐ Il totale è un'ANTEPRIMA: il server ricalcola tutto alla conferma. */
  protected readonly totaleMinor = computed(() =>
    this.righe().reduce((tot, r) => tot + this.importiRiga(r.item, r.quantity).lineGrossMinor, 0),
  );
  protected readonly ivaNonSupportata = computed(() =>
    this.righe().some((row) => {
      const amounts = this.importiRiga(row.item, row.quantity);
      return amounts.lineNetMinor + amounts.lineVatMinor !== amounts.lineGrossMinor;
    }),
  );

  protected importiRiga(item: StoreSaleLookupItem, quantity = 1) {
    return computeVatLineAmounts({
      enteredUnitCostMinor: item.sellingPriceMinor,
      costEntryMode: 'vat_excluded',
      quantity,
      discountPercent: 0,
      vat: item.vatSnapshot
        ? vatInputFromSnapshot(item.vatSnapshot)
        : vatInputFromLegacyRate(item.vatRatePercent),
    });
  }

  protected readonly quotePronte = computed(() => {
    const quote = this.quote();
    if (quote.length === 0) {
      return false;
    }
    const somma = quote.reduce((tot, q) => tot + q.amountMinor, 0);
    if (somma !== this.totaleMinor()) {
      return false;
    }
    return quote.every((q) => {
      const opzione = this.opzioni().find((o) => o.id === q.paymentOptionId);
      if (opzione?.tenderKind === 'electronic') {
        return q.confirmed;
      }
      if (opzione?.tenderKind === 'cash' && q.tenderedMinor !== null) {
        return q.tenderedMinor >= q.amountMinor;
      }
      return true;
    });
  });

  protected readonly puoConcludere = computed(
    () =>
      !!this.sessione() &&
      this.righe().length > 0 &&
      this.totaleMinor() > 0 &&
      this.quotePronte() &&
      !this.quantitaDaCorreggere() &&
      !this.ivaNonSupportata() &&
      !this.conclusione() &&
      !this.invioPrecedente().request &&
      !this.invioPrecedente().error,
  );

  constructor() {
    // ⚠️ **Un `effect`, non una lettura nel costruttore**: l'elenco sedi e il
    //    profilo arrivano dalla rete, e la predefinita può comparire dopo il
    //    primo render.
    effect(() => {
      if (this.sedeId()) {
        return;
      }
      const predefinita = this.sedi.defaultLocation();
      if (predefinita) {
        this.scegliSede(predefinita.id);
        return;
      }
      // ⛔ **Con UNA sola sede si sceglie da sé.** Senza, la schermata diceva
      //    «Scegli la sede» e non offriva come: il selettore compare solo da
      //    due sedi in su, e chi ne ha una restava in un vicolo cieco.
      //    Misurato nel browser il 04/09/2026, e non lo vedeva nessuna prova
      //    di componente — lì la sede era sempre precompilata.
      const sedi = this.sedi.locations();
      if (sedi.length === 1) {
        this.scegliSede(sedi[0]!.id);
      }
    });
  }

  // ── La sessione ──────────────────────────────────────────────────────────

  protected scegliSede(locationId: EntityId): void {
    this.sedeId.set(locationId);
    this.conclusa.set(null);
    this.caricaSessione();
  }

  protected caricaSessione(): void {
    const sede = this.sedeId();
    if (!sede) {
      return;
    }
    this.caricamento.set(true);
    this.errore.set(null);
    this.api
      .current(sede)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stato) => {
          this.stato.set(stato);
          this.caricamento.set(false);
        },
        error: (e: unknown) => {
          this.stato.set(null);
          this.errore.set(messaggio(e, 'Non è stato possibile leggere la sessione di cassa.'));
          this.caricamento.set(false);
        },
      });
  }

  protected apriSessione(): void {
    const sede = this.sedeId();
    if (!sede) {
      return;
    }
    this.caricamento.set(true);
    this.errore.set(null);
    this.api
      .open({ locationId: sede, openingFloatMinor: this.fondoApertura() ?? 0 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.caricaSessione(),
        error: (e: unknown) => {
          this.errore.set(messaggio(e, 'Non è stato possibile aprire la sessione.'));
          this.caricamento.set(false);
        },
      });
  }

  // ── Il carrello ──────────────────────────────────────────────────────────

  protected cerca(): void {
    const sede = this.sedeId();
    const testo = this.ricerca().trim();
    if (!sede || testo.length < 2) {
      this.risultati.set([]);
      return;
    }
    this.cercando.set(true);
    this.catalogo
      .lookupItems(testo, sede)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.risultati.set(items);
          this.cercando.set(false);
          // ⭐ Codice esatto e un solo risultato: si aggiunge da sé. È la
          //    scansione, e chiedere un secondo gesto al banco non ha senso.
          if (items.length === 1 && this.eCodiceEsatto(items[0]!, testo)) {
            this.aggiungi(items[0]!);
          }
        },
        error: (e: unknown) => {
          this.risultati.set([]);
          this.cercando.set(false);
          this.errore.set(messaggio(e, 'Ricerca articoli non riuscita.'));
        },
      });
  }

  protected aggiungi(item: StoreSaleLookupItem): void {
    this.ricerca.set('');
    this.risultati.set([]);
    const esistente = this.righe().find((r) => r.item.variantId === item.variantId);
    if (esistente) {
      if (
        this.quantitaValida(esistente.quantityDraft) === null ||
        this.quantitaValida(String(esistente.quantity + 1)) === null
      ) {
        this.errore.set(
          `Completa una quantità valida per ${item.productName}: l’articolo scansionato non è stato aggiunto.`,
        );
        return;
      }
      this.cambiaQuantita(item.variantId, String(esistente.quantity + 1));
      return;
    }
    this.righe.set([...this.righe(), { item, quantity: 1, quantityDraft: '1' }]);
    this.verificaGiacenze();
  }

  protected cambiaQuantita(variantId: EntityId, digitato: string): void {
    const quantita = this.quantitaValida(digitato);
    this.righe.set(
      this.righe().map((r) =>
        r.item.variantId === variantId
          ? { ...r, quantityDraft: digitato, quantity: quantita ?? r.quantity }
          : r,
      ),
    );
    this.verificaGiacenze();
  }

  /** Come le righe documentali: obbligatorio, intero positivo. Il testo resta
   * in modifica; il limite superiore è quello di quantity Int nel database. */
  protected quantitaValida(digitato: string): number | null {
    if (!/^\d+$/.test(digitato)) return null;
    const value = Number(digitato);
    return Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647 ? value : null;
  }

  protected rimuovi(variantId: EntityId): void {
    this.righe.set(this.righe().filter((r) => r.item.variantId !== variantId));
    this.verificaGiacenze();
  }

  /**
   * ⚠️ **Avvisi, non blocchi.** Vendere l'ultimo pezzo quando la giacenza dice
   * zero capita, e la Cassa non è il posto dove discuterne col cliente davanti
   * (`regole-gestionale`: i controlli di business sono warning).
   */
  private verificaGiacenze(): void {
    this.avvisi.set(
      this.righe()
        .filter((r) => r.quantity > r.item.available)
        .map(
          (r) => `${r.item.productName}: disponibili ${r.item.available}, richiesti ${r.quantity}.`,
        ),
    );
  }

  protected aggiornaQuote(quote: readonly CashQuotaDraft[]): void {
    this.quote.set(quote);
  }

  // ── La conclusione ───────────────────────────────────────────────────────

  protected concludi(): void {
    const sede = this.sedeId();
    const sessione = this.sessione();
    if (!sede || !sessione || !this.puoConcludere()) {
      return;
    }
    try {
      const payload = this.pending.prepare(
        'checkout',
        {
          locationId: sede,
          sessionId: sessione.id,
          // ⛔ `nuovoId()`, mai `crypto.randomUUID()`: in magazzino la pagina si
          //    apre su `http://192.168…`, che NON è contesto sicuro
          //    (`regole-qualita`).
          creationIntentId: nuovoId(),
          ...this.contenutoVendita(),
        },
        'Vendita di ' +
          this.soldi(this.totaleMinor()) +
          ': ' +
          this.righe()
            .map((r) => r.quantity + ' × ' + r.item.productName)
            .join(', '),
      );
      this.invia(payload, false);
    } catch (error) {
      this.errore.set(error instanceof Error ? error.message : 'Invio non disponibile.');
    }
  }

  protected recuperaInvio(): void {
    if (this.conclusione()) return;
    try {
      const payload = this.pending.recover('checkout');
      if (payload) this.invia(payload, true);
    } catch (error) {
      this.errore.set(error instanceof Error ? error.message : 'Recupero non disponibile.');
    }
  }

  private invia(payload: CashCheckoutPayload, recovering: boolean): void {
    this.conclusione.set(true);
    this.errore.set(null);
    this.api
      .checkout(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (esito) => {
          this.pending.complete('checkout', payload.creationIntentId);
          // ⭐ I valori mostrati sono quelli del SERVER, non quelli calcolati
          //    dalla schermata.
          this.conclusa.set({
            reference: esito.reference,
            totalMinor: esito.totalMinor,
            changeMinor: esito.changeMinor,
            documentId: esito.documentId,
          });
          const modificato =
            this.quantitaDaCorreggere() ||
            JSON.stringify(this.contenutoVendita()) !==
              JSON.stringify({ lines: payload.lines, payments: payload.payments });
          this.carrelloConservato.set(modificato && this.righe().length > 0);
          // Non scarta modifiche preparate mentre la risposta era in attesa o incerta.
          if (!modificato) {
            this.righe.set([]);
            this.quote.set([]);
            this.avvisi.set([]);
          }
          this.conclusione.set(false);
          this.caricaSessione();
        },
        error: (e: unknown) => {
          this.pending.failed('checkout', payload.creationIntentId, e, recovering);
          this.errore.set(
            messaggio(
              e,
              this.invioPrecedente().request
                ? 'Esito della vendita da verificare. Recupera l’invio precedente.'
                : 'La vendita è stata rifiutata.',
            ),
          );
          this.conclusione.set(false);
        },
      });
  }

  protected nuovaVendita(): void {
    this.conclusa.set(null);
    this.errore.set(null);
  }

  private contenutoVendita(): Pick<CashCheckoutPayload, 'lines' | 'payments'> {
    return {
      lines: this.righe().map((r) => ({
        variantId: r.item.variantId,
        quantity: r.quantity,
        unitPriceMinor: r.item.sellingPriceMinor,
      })),
      payments: this.quote().map((q) => ({
        paymentOptionId: q.paymentOptionId,
        amountMinor: q.amountMinor,
        tenderedMinor: q.tenderedMinor,
        confirmed: q.confirmed,
      })),
    };
  }

  protected soldi(minor: number): string {
    return formatMoney({ amountMinor: minor, currencyCode: 'EUR' });
  }

  private eCodiceEsatto(item: StoreSaleLookupItem, testo: string): boolean {
    const cercato = testo.toLowerCase();
    return item.sku.toLowerCase() === cercato || (item.barcode ?? '').toLowerCase() === cercato;
  }
}

interface CartLine {
  readonly item: StoreSaleLookupItem;
  readonly quantity: number;
  readonly quantityDraft: string;
}

interface ConclusaResult {
  readonly documentId: EntityId;
  readonly reference: string;
  readonly totalMinor: number;
  readonly changeMinor: number;
}

/** Il messaggio dell'API se c'è, altrimenti quello di riserva. */
function messaggio(errore: unknown, riserva: string): string {
  if (isAppError(errore)) return errore.message;
  const corpo = (errore as { error?: { message?: string | string[] } } | null)?.error;
  const testo = corpo?.message;
  if (Array.isArray(testo)) {
    return testo.join(' · ');
  }
  return testo ?? riserva;
}
