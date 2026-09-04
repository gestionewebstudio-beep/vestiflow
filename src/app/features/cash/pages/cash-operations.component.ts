import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component,
  DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal  } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import type { EntityId } from '@core/models/common.model';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { formatMoney } from '@core/utils/money.util';
import type {
  CashOperationKind,
  CashOperationRow,
  CashOperationsPage,
  ReceiptSearchResult,
} from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';

/**
 * Il **registro operativo** della Cassa: riepiloghi e operazioni, su tutte le
 * sedi comprese nel perimetro dell'utente.
 *
 * ⛔ **Non è il Registro corrispettivi.** Quello è contabile e aggrega valori
 * economici; questo serve a vedere le operazioni — chi, quando, con quali
 * quote, con quale resto. Le stesse vendite alimentano entrambi, per strade
 * diverse e senza doppia contabilizzazione.
 *
 * ⛔ **Nessun totale si calcola qui**: elenco e riepilogo arrivano dallo stesso
 * filtro, dal server. Sommare le righe a schermo darebbe il totale della
 * PAGINA, non del periodo.
 */
@Component({
  selector: 'app-cash-operations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    DatePipe,
    EmptyStateComponent,
    ErrorStateComponent,
    FormsModule,
    RouterLink,
    SelectMenuComponent,
    SlidePanelComponent,
  ],
  templateUrl: './cash-operations.component.html',
  styleUrl: './cash-operations.component.scss',
})
export class CashOperationsComponent {
  private readonly api = inject(CashApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sedi = inject(OperationalLocationsService);
  private readonly tipiPagamento = inject(PaymentOptionsService);
  private readonly router = inject(Router);

  protected readonly pagina = signal<CashOperationsPage | null>(null);
  protected readonly caricamento = signal(false);
  protected readonly errore = signal<string | null>(null);

  // ── Filtri ───────────────────────────────────────────────────────────────
  protected readonly da = signal('');
  protected readonly a = signal('');
  protected readonly sedeId = signal<EntityId | null>(null);
  protected readonly tipo = signal<CashOperationKind | null>(null);
  protected readonly tipoPagamento = signal<EntityId | null>(null);
  protected readonly numero = signal('');
  protected readonly soloAnomalie = signal(false);

  // ── Richiamo scontrino ───────────────────────────────────────────────────
  protected readonly pannelloReso = signal(false);
  protected readonly ricercaScontrino = signal('');
  protected readonly scontrini = signal<readonly ReceiptSearchResult[]>([]);
  protected readonly cercandoScontrini = signal(false);

  protected readonly opzioni = toSignal(
    this.tipiPagamento.list('method').pipe(catchError(() => of([] as readonly PaymentOption[]))),
    { initialValue: [] as readonly PaymentOption[] },
  );

  protected readonly sediSelezionabili = computed(() =>
    this.sedi.locations().map((l) => ({ value: l.id, label: l.name })),
  );

  protected readonly opzioniSelezionabili = computed(() =>
    this.opzioni()
      .filter((o) => o.kind === 'method')
      .map((o) => ({ value: o.id, label: o.name })),
  );

  protected readonly tipiOperazione = [
    { value: 'sale', label: 'Vendite' },
    { value: 'return', label: 'Resi' },
  ];

  constructor() {
    this.carica();
  }

  protected carica(): void {
    this.caricamento.set(true);
    this.errore.set(null);
    this.api
      .operations({
        page: 1,
        pageSize: 100,
        from: this.da() || undefined,
        to: this.a() || undefined,
        locationId: this.sedeId() ?? undefined,
        kind: this.tipo() ?? undefined,
        paymentOptionId: this.tipoPagamento() ?? undefined,
        number: this.numero().trim() || undefined,
        anomaliesOnly: this.soloAnomalie() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (p) => {
          this.pagina.set(p);
          this.caricamento.set(false);
        },
        error: () => {
          this.pagina.set(null);
          this.errore.set('Non è stato possibile leggere il registro.');
          this.caricamento.set(false);
        },
      });
  }

  protected azzeraFiltri(): void {
    this.da.set('');
    this.a.set('');
    this.sedeId.set(null);
    this.tipo.set(null);
    this.tipoPagamento.set(null);
    this.numero.set('');
    this.soloAnomalie.set(false);
    this.carica();
  }

  // ── Il richiamo dello scontrino ──────────────────────────────────────────

  protected apriRichiamo(): void {
    this.pannelloReso.set(true);
    this.scontrini.set([]);
    this.ricercaScontrino.set('');
  }

  /**
   * ⛔ **Nessun UUID.** Si cerca per numero, articolo o cliente: l'operatore
   * non conosce un identificativo e non deve impararlo.
   */
  protected cercaScontrino(): void {
    const testo = this.ricercaScontrino().trim();
    this.cercandoScontrini.set(true);
    this.api.searchReceipts({ text: testo || undefined, limit: 20 }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (trovati) => {
        this.scontrini.set(trovati);
        this.cercandoScontrini.set(false);
      },
      error: () => {
        this.scontrini.set([]);
        this.cercandoScontrini.set(false);
      },
    });
  }

  protected vaiAlReso(documentId: EntityId): void {
    this.pannelloReso.set(false);
    void this.router.navigate(['/app/cassa/operazioni', documentId, 'reso']);
  }

  // ── Presentazione ────────────────────────────────────────────────────────

  protected soldi(minor: number): string {
    return formatMoney({ amountMinor: minor, currencyCode: 'EUR' });
  }

  /** «Contanti», «Carta», o «Misto» quando le quote sono più di una. */
  protected pagamento(riga: CashOperationRow): string {
    if (riga.mixed) {
      return 'Misto';
    }
    return riga.payments[0]?.optionName ?? '—';
  }

  protected etichettaAnomalia(codice: string): string {
    return ANOMALIE[codice] ?? codice;
  }
}

/** Le anomalie, come le legge un operatore. */
const ANOMALIE: Record<string, string> = {
  annullato: 'Annullato',
  quota_non_classificata: 'Incasso senza classe',
  reso_senza_origine: 'Reso senza vendita',
  rimborso_non_agganciato: 'Rimborso non collegato',
  quote_non_quadrate: 'Incassi non quadrati',
};
