import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Supplier } from '@core/models/supplier.model';
import { canManageSupplierOrders } from '@core/permissions/tenant-permissions.util';
import { vatCodeOptionLabel, type VatCode } from '@core/models/vat-code.model';
import { VatCodeService } from '@core/services/vat-code.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DetailFactsComponent } from '@shared/components/detail-facts/detail-facts.component';
import type { DetailFact } from '@shared/components/detail-facts/detail-facts.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { SupplierAttachmentsPanelComponent } from './components/supplier-attachments-panel/supplier-attachments-panel.component';
import { SupplierService } from '@domain/suppliers/services/supplier.service';

type DetailState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly supplier: Supplier;
    }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

@Component({
  selector: 'app-supplier-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BackButtonComponent,
    ButtonComponent,
    DetailFactsComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    SupplierAttachmentsPanelComponent,
  ],
  templateUrl: './supplier-detail.component.html',
  styleUrl: './supplier-detail.component.scss',
})
export class SupplierDetailComponent {
  private readonly service = inject(SupplierService);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  // Lookup Codici IVA per mostrare "22 · 22% · Imponibile 22%" nei fatti fornitore.
  private readonly vatCodes = toSignal(
    this.vatCodeService.list().pipe(catchError(() => of([] as readonly VatCode[]))),
    { initialValue: [] as readonly VatCode[] },
  );

  protected vatCodeLabel(vatCodeId: string | null | undefined): string {
    if (!vatCodeId) {
      return '—';
    }
    const entry = this.vatCodes().find((vatCode) => vatCode.id === vatCodeId);
    return entry ? vatCodeOptionLabel(entry) : '—';
  }

  protected readonly listPath = '/app/suppliers';
  protected readonly skeletonColumns = 3;
  protected readonly canManage = computed(() =>
    canManageSupplierOrders(this.authService.currentUser()),
  );

  private readonly refreshTick = signal(0);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });

  private readonly request = computed(() => ({
    id: this.params().get('id') ?? '',
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of({ status: 'not-found' } satisfies DetailState);
        }
        return this.service.getById(id).pipe(
          map((supplier): DetailState => ({ status: 'success', supplier })),
          startWith<DetailState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.toErrorState(err))),
        );
      }),
    ),
    { initialValue: { status: 'loading' } satisfies DetailState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly notFound = computed(() => this.state().status === 'not-found');
  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });
  protected readonly supplier = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.supplier : null;
  });
  /*
    ⭐ **La scheda è divisa come la MASCHERA**, non un elenco solo di ventidue
    voci — proprietario, 01/09/2026: «va sistemata la visualizzazione della
    scheda dettaglio in modo carino».

    ⚠️ **Gli stessi cinque gruppi, e nello stesso ordine** di
    `supplier-form-fields`: chi ha appena compilato la scheda ritrova i dati
    dove li ha scritti. Un raggruppamento diverso fra maschera e dettaglio
    costringerebbe a cercare due volte.

    ⚠️ **Il pannello e la griglia sono già condivisi** — `detail-page` per il
    riquadro, `app-detail-facts` per la coppia etichetta/valore: qui non si
    disegna niente di nuovo, si passano cinque elenchi invece di uno. È la
    stessa forma che `customer-detail` usa da sempre con due.
  */
  protected readonly datiGeneraliFacts = computed((): readonly DetailFact[] => {
    const s = this.supplier();
    return !s
      ? []
      : [
          { label: 'Codice', value: s.code ?? '—' },
          { label: 'P. IVA', value: s.vatNumber ?? '—' },
          { label: 'Codice fiscale', value: s.taxCode ?? '—' },
          {
            label: 'Anche cliente',
            value: s.linkedCustomerId
              ? s.linkedCustomerActive
                ? 'Sì — stesso soggetto in anagrafica clienti'
                : 'Ruolo cliente disattivato (storico conservato)'
              : 'No',
          },
        ];
  });

  /*
    ⚠️ **L'indirizzo si mostra a CAMPI, non come riga unica.** Composto
    («Via Roma 1, 80013 Casalnuovo di Napoli, NA, IT») occupava un pannello
    intero per una riga sola, e non diceva quale pezzo mancasse quando ne
    mancava uno. A campi il riquadro è proporzionato e rispecchia la maschera,
    dove quei cinque campi stanno insieme.
  */
  protected readonly indirizzoFacts = computed((): readonly DetailFact[] => {
    const s = this.supplier();
    return !s
      ? []
      : [
          { label: 'Indirizzo', value: s.addressLine1 ?? '—' },
          ...(s.addressLine2 ? [{ label: 'Indirizzo (riga 2)', value: s.addressLine2 }] : []),
          { label: 'CAP', value: s.postalCode ?? '—' },
          { label: 'Città', value: s.city ?? '—' },
          { label: 'Prov.', value: s.province ?? '—' },
          { label: 'Paese', value: s.countryCode ?? '—' },
        ];
  });

  protected readonly contattiFacts = computed((): readonly DetailFact[] => {
    const s = this.supplier();
    return !s
      ? []
      : [
          { label: 'Email', value: s.email ?? '—' },
          { label: 'PEC', value: s.pec ?? '—' },
          { label: 'Telefono', value: s.phone ?? '—' },
          { label: 'Cellulare', value: s.mobilePhone ?? '—' },
          { label: 'Referente', value: s.contactName ?? '—' },
          { label: 'Sito web', value: s.website ?? '—' },
        ];
  });

  protected readonly condizioniFacts = computed((): readonly DetailFact[] => {
    const s = this.supplier();
    return !s
      ? []
      : [
          { label: 'Modalità di pagamento', value: s.paymentMethod ?? '—' },
          { label: 'Condizioni di pagamento', value: s.paymentTerms ?? '—' },
          { label: 'Sconto', value: s.supplierDiscount ?? '—' },
          { label: 'Codice IVA', value: this.vatCodeLabel(s.defaultVatCodeId) },
          { label: 'Incaricato trasporto', value: s.transportResponsible ?? '—' },
          { label: 'Porto', value: s.freightTerms ?? '—' },
          { label: 'IBAN', value: s.iban ?? '—' },
          { label: 'Ns. banca', value: s.ourBankName ?? '—' },
        ];
  });

  /*
    ⚠️ **Questo gruppo si NASCONDE quando è vuoto**, al contrario degli altri:
    avviso, nota e note sono facoltativi e nella pratica quasi sempre vuoti —
    tre trattini in fila occupano una fascia per non dire niente. Gli altri
    quattro gruppi restano sempre: lì il trattino dice «manca», ed è
    un'informazione.
  */
  protected readonly documentiFacts = computed((): readonly DetailFact[] => {
    const s = this.supplier();
    if (!s) {
      return [];
    }
    const voci: DetailFact[] = [];
    if (s.documentCreationAlert) {
      voci.push({ label: 'Avviso alla creazione documento', value: s.documentCreationAlert });
    }
    if (s.documentCreationNote) {
      voci.push({ label: 'Nota nei documenti', value: s.documentCreationNote });
    }
    if (s.notes) {
      voci.push({ label: 'Note', value: s.notes });
    }
    return voci;
  });

  protected readonly customerLinkPath = computed(() => {
    const customerId = this.supplier()?.linkedCustomerId;
    return customerId ? `/app/customers/${customerId}` : null;
  });

  protected goToList(): void {
    void this.router.navigate([this.listPath]);
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected editSupplier(): void {
    const s = this.supplier();
    if (s) {
      void this.router.navigate(['/app/suppliers', s.id, 'edit']);
    }
  }

  /*
    ⛔ **Qui c'era `formatAddress`**, che univa via, CAP, città, provincia e
    paese in una riga sola. Tolto il 01/09/2026 con la divisione a campi: era
    rimasto senza chiamanti, e nessun lint lo dice per un metodo privato.
  */

  private toErrorState(err: unknown): DetailState {
    if (isAppError(err) && err.kind === AppErrorKind.NotFound) {
      return { status: 'not-found' };
    }
    if (isAppError(err)) {
      return { status: 'error', error: err };
    }
    return { status: 'error', error: { kind: AppErrorKind.Unknown, message: 'Errore imprevisto' } };
  }
}
