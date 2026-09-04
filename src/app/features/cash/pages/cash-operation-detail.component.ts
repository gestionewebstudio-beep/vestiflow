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
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '@core/auth';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { hasTenantPermission } from '@core/permissions/user-permissions.util';
import { formatMoney } from '@core/utils/money.util';
import type { CashOperationDetail } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { DocumentLinesTableComponent } from '@domain/documents/components/document-lines-table/document-lines-table.component';
import { DocumentTotalsComponent } from '@domain/documents/components/document-totals/document-totals.component';
import type { DocumentTotalRow } from '@domain/documents/components/document-totals/document-totals.model';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import {
  DetailFactsComponent,
  type DetailFact,
} from '@shared/components/detail-facts/detail-facts.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { FormSectionComponent } from '@shared/components/form-section/form-section.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';

/**
 * Il dettaglio di un'operazione di Cassa: righe, quote, resto, movimenti,
 * sessione, collegamenti.
 *
 * ⛔ **Nessuna modifica e nessuna cancellazione.** Una vendita di Cassa conclusa
 * non si riapre: si corregge con un RESO, che è un documento nuovo e collegato.
 * Non esiste una rotta che la riporti in modifica.
 *
 * ⭐ **Non disegna niente di suo.** Righe, totali, fatti e sezioni sono i
 * componenti condivisi dei documenti: la prima stesura li aveva riscritti tutti
 * e quattro, ed erano la stessa cosa con altri nomi di classe.
 */
@Component({
  selector: 'app-cash-operation-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackButtonComponent,
    DatePipe,
    DetailFactsComponent,
    DocumentLinesTableComponent,
    DocumentTotalsComponent,
    ErrorStateComponent,
    FormSectionComponent,
    InlineBannerComponent,
    RouterLink,
  ],
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

  /**
   * I totali per `app-document-totals`.
   *
   * ⚠️ Valori già decisi dal server: il componente rende, non calcola — e
   * nemmeno questo `computed` calcola niente.
   */
  protected readonly righeTotali = computed<readonly DocumentTotalRow[]>(() => {
    const o = this.operazione();
    if (!o) {
      return [];
    }
    return [
      { key: 'imponibile', label: 'Imponibile', value: euro(o.taxableMinor) },
      { key: 'iva', label: 'IVA', value: euro(o.taxMinor) },
      {
        key: 'totale',
        label: o.kind === 'sale' ? 'Totale vendita' : 'Totale reso',
        value: euro(o.totalMinor),
        kind: 'total',
      },
    ];
  });

  /** I collegamenti, per `app-detail-facts`. */
  protected readonly fatti = computed<readonly DetailFact[]>(() => {
    const o = this.operazione();
    if (!o) {
      return [];
    }
    const fatti: DetailFact[] = [
      {
        label: 'Sessione',
        value: o.session ? `aperta da ${o.session.openedByName}` : '—',
        ...(o.session
          ? { href: `/app/cassa/sessioni/${o.session.id}`, linkLabel: 'Apri la sessione' }
          : {}),
      },
    ];
    if (o.sourceDocumentId) {
      fatti.push({
        label: 'Vendita originale',
        value: o.sourceReference ?? '—',
        href: `/app/cassa/operazioni/${o.sourceDocumentId}`,
        linkLabel: 'Apri la vendita',
      });
    }
    for (const reso of o.relatedReturns) {
      fatti.push({
        label: 'Reso collegato',
        value: `${reso.reference ?? 'Reso'} · ${soldi(reso.totalMinor)}`,
        numeric: true,
        href: `/app/cassa/operazioni/${reso.id}`,
        linkLabel: 'Apri il reso',
      });
    }
    return fatti;
  });

  protected readonly testoAnomalie = computed(() =>
    (this.operazione()?.anomalies ?? []).map((a) => ANOMALIE[a] ?? a).join(' · '),
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
      .operation(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
    return soldi(minor);
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

function euro(amountMinor: number) {
  return { amountMinor, currencyCode: 'EUR' as const };
}

function soldi(amountMinor: number): string {
  return formatMoney(euro(amountMinor));
}
