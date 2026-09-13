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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '@core/auth';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { hasTenantPermission } from '@core/permissions/user-permissions.util';
import { formatDate, formatDateTimeShort } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import type {
  CashDeviceChange,
  CashMovementType,
  CashSessionDetail,
  CashSessionMovement,
} from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { FormSectionComponent } from '@shared/components/form-section/form-section.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { MoneyInputComponent } from '@shared/components/money-input/money-input.component';
import { colonna } from '@shared/table-columns/column-catalog';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

/** Un documento della sessione, come lo rende `CashSessionDetail`. */
type DocumentoSessione = CashSessionDetail['documents'][number];

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
    DataTableComponent,
    DataTableRowCardDirective,
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
  private readonly router = inject(Router);

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

  // ── I tre elenchi di registrazioni, sul MOTORE comune (`docs/26` A19) ────
  // Cassetto, operazioni della sessione e cambi di registratore erano tre
  // `<ul>` con la stessa veste scritta a mano. Sono elenchi di consultazione:
  // colonne dal catalogo, ordinamento, card sotto `lg`. Nessun totale: un
  // versamento e un prelievo non si sommano, e i totali della sessione
  // stanno già nella quadratura.
  protected readonly ordineCassetto = signal<readonly DataTableSort[]>([]);
  protected readonly ordineDocumenti = signal<readonly DataTableSort[]>([]);
  protected readonly ordineCambi = signal<readonly DataTableSort[]>([]);

  protected readonly formatDate = formatDate;
  protected readonly idDi = (r: { readonly id: string }): string => r.id;

  protected readonly colonneCassetto: readonly ResolvedTableColumn[] = [
    { ...colonna('type', { defaultVisible: true, cardTitle: true }), pinned: false },
    {
      id: 'amount',
      label: 'Importo',
      numeric: true,
      summable: false,
      defaultVisible: true,
      defaultWidthPx: 120,
      pinned: false,
    },
    { id: 'reason', label: 'Causale', defaultVisible: true, pinned: false },
    {
      ...colonna('createdAt', { label: 'Quando', defaultVisible: true, defaultWidthPx: 130 }),
      pinned: false,
    },
    {
      id: 'operator',
      label: 'Operatore',
      defaultVisible: true,
      defaultWidthPx: 160,
      pinned: false,
    },
  ];
  protected readonly testoCassetto = (m: CashSessionMovement, id: string): string => {
    switch (id) {
      case 'type':
        return this.etichettaMovimento(m.type);
      case 'amount':
        return this.soldi(m.amountMinor);
      case 'reason':
        return m.reason;
      case 'createdAt':
        return formatDateTimeShort(m.createdAt);
      case 'operator':
        return m.createdByName;
      default:
        return '';
    }
  };
  protected readonly sezioniCassetto = computed<readonly DataTableSection<CashSessionMovement>[]>(
    () => [
      {
        id: 'cassetto',
        rows: ordinaPerColonne(this.sessione()?.movements ?? [], this.ordineCassetto(), {
          cellText: this.testoCassetto,
          numeroDi: (m, id) => (id === 'amount' ? m.amountMinor : null),
          dataDi: (m, id) => (id === 'createdAt' ? m.createdAt : null),
        }),
      },
    ],
  );

  protected readonly colonneDocumenti: readonly ResolvedTableColumn[] = [
    {
      ...colonna('documentDate', { defaultVisible: true, defaultWidthPx: 110, cardTitle: true }),
      pinned: false,
    },
    { ...colonna('type', { defaultVisible: true, defaultWidthPx: 100 }), pinned: false },
    {
      ...colonna('reference', { label: 'Numero', display: 'code', defaultVisible: true }),
      pinned: false,
    },
    { id: 'operator', label: 'Operatore', defaultVisible: true, pinned: false },
    { ...colonna('status', { defaultVisible: true, defaultWidthPx: 110 }), pinned: false },
    {
      ...colonna('total', { summable: false, defaultVisible: true, defaultWidthPx: 120 }),
      pinned: false,
    },
  ];
  protected readonly testoDocumento = (d: DocumentoSessione, id: string): string => {
    switch (id) {
      case 'documentDate':
        return formatDate(d.documentDate);
      case 'type':
        return d.kind === 'sale' ? 'Vendita' : 'Reso';
      case 'reference':
        return d.reference;
      case 'operator':
        return d.createdByName;
      case 'status':
        return d.status === 'cancelled' ? 'Annullato' : d.status;
      case 'total':
        return this.soldi(d.totalMinor);
      default:
        return '';
    }
  };
  protected readonly etichettaDocumento = (d: DocumentoSessione): string =>
    `${d.kind === 'sale' ? 'Vendita' : 'Reso'} ${d.reference}`;
  protected readonly sezioniDocumenti = computed<readonly DataTableSection<DocumentoSessione>[]>(
    () => [
      {
        id: 'documenti',
        rows: ordinaPerColonne(this.sessione()?.documents ?? [], this.ordineDocumenti(), {
          cellText: this.testoDocumento,
          numeroDi: (d, id) => (id === 'total' ? d.totalMinor : null),
          dataDi: (d, id) => (id === 'documentDate' ? d.documentDate : null),
        }),
      },
    ],
  );
  /** Il clic di riga apre il dettaglio dell’operazione, come prima faceva il link. */
  protected apriDocumento(d: DocumentoSessione): void {
    void this.router.navigate(['/app/cassa/operazioni', d.id]);
  }

  protected readonly colonneCambi: readonly ResolvedTableColumn[] = [
    { id: 'reason', label: 'Causale', defaultVisible: true, cardTitle: true, pinned: false },
    {
      ...colonna('createdAt', { label: 'Quando', defaultVisible: true, defaultWidthPx: 130 }),
      pinned: false,
    },
    {
      id: 'operator',
      label: 'Operatore',
      defaultVisible: true,
      defaultWidthPx: 160,
      pinned: false,
    },
  ];
  protected readonly testoCambio = (c: CashDeviceChange, id: string): string => {
    switch (id) {
      case 'reason':
        return c.reason;
      case 'createdAt':
        return formatDateTimeShort(c.createdAt);
      case 'operator':
        return c.changedByName;
      default:
        return '';
    }
  };
  protected readonly sezioniCambi = computed<readonly DataTableSection<CashDeviceChange>[]>(() => [
    {
      id: 'cambi',
      rows: ordinaPerColonne(this.sessione()?.deviceChanges ?? [], this.ordineCambi(), {
        cellText: this.testoCambio,
        dataDi: (c, id) => (id === 'createdAt' ? c.createdAt : null),
      }),
    },
  ]);
}

function messaggio(errore: unknown, riserva: string): string {
  const corpo = (errore as { error?: { message?: string | string[] } } | null)?.error;
  const testo = corpo?.message;
  if (Array.isArray(testo)) {
    return testo.join(' · ');
  }
  return testo ?? riserva;
}
