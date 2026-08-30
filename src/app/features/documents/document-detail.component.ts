import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import type { Observable, Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { AdjustmentDirection, DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord, DocumentRevision } from '@core/models/document.model';
import { isConfirmedEditableDocumentStatus } from '@core/models/document.model';
import { canManageDocumentType } from '@core/permissions/document-permission.util';
import { canManageDocFamily } from '@core/permissions/tenant-permissions.util';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { bindBreadcrumbEntityLabel } from '@core/services/breadcrumb-label.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { DetailFactsComponent } from '@shared/components/detail-facts/detail-facts.component';
import type { DetailFact } from '@shared/components/detail-facts/detail-facts.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { DocumentLinesTableComponent } from './components/document-lines-table/document-lines-table.component';
import { DocumentAttachmentsPanelComponent } from './components/document-attachments-panel/document-attachments-panel.component';
import {
  documentReferenceLabel,
  documentStatusDisplayLabel,
  documentStatusDisplayTone,
  documentStatusLabelForType,
  documentTypeLabel,
} from '@domain/documents/models/document-labels.util';
import { isGoodsReceiptDocumentType } from '@domain/documents/utils/document-goods-receipt.util';
import { isPrintableDocumentType } from './models/document-print.util';
import {
  documentDuplicateFormRoute,
  documentEditPath,
} from '@domain/documents/utils/document-routing.util';
import { isTransferDocumentType } from '@domain/documents/utils/document-transfer.util';
import {
  isAdjustmentDocumentType,
  isManualUnloadDocumentType,
  isStockOperationDocumentType,
} from '@domain/documents/utils/document-stock-operation.util';
import { isStoreFlowDocumentType } from '@domain/documents/models/document-operational.util';
import {
  isInvoiceDocumentType,
  isProformaDocumentType,
  isQuoteDocumentType,
  isSalesDdtDocumentType,
  isSalesFormDocumentType,
  isSalesInvoiceDocumentType,
} from '@domain/documents/models/document-sales.util';
import {
  TRANSPORT_INCOMPLETE_MESSAGE,
  TRANSPORT_INCOMPLETE_TITLE,
  transportDataIncomplete,
} from '@domain/documents/models/document-transport.util';
import { DocumentService } from '@domain/documents/services/document.service';
import { ProductLabelPrintService } from '@domain/products/services/product-label-print.service';
import { counterpartyDocLabel } from '@domain/documents/models/document-labels.util';
import { take } from 'rxjs';

type ActionState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly document: DocumentRecord }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Dettaglio documento (smart, sola lettura). Espone le transizioni di stato
 * (conferma, annullamento, eliminazione) con dialogo per le azioni sensibili.
 */
@Component({
  selector: 'app-document-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackButtonComponent,
    BadgeComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DetailFactsComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    DocumentLinesTableComponent,
    DocumentAttachmentsPanelComponent,
  ],
  templateUrl: './document-detail.component.html',
  styleUrl: './document-detail.component.scss',
})
export class DocumentDetailComponent {
  private readonly service = inject(DocumentService);
  private readonly labelPrintService = inject(ProductLabelPrintService);
  private readonly authService = inject(AuthService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Breadcrumb: al posto del generico «Dettaglio», il numero del documento.
    bindBreadcrumbEntityLabel(() => {
      const doc = this.document();
      return {
        id: this.params().get('id') || null,
        label: doc ? documentReferenceLabel(doc.type, doc.reference, doc.series) : null,
      };
    });
  }

  // Tipo esplicito string: le anteprime dedicate (SalesDocumentDetailComponent)
  // sovrascrivono il percorso con la propria pagina elenco.
  protected readonly listPath = computed<string>(() => {
    const doc = this.document();
    if (doc && isGoodsReceiptDocumentType(doc.type)) {
      return '/app/documents/arrivi-merce';
    }
    return '/app/documents/registro';
  });
  protected readonly skeletonColumns = 8;

  protected readonly statusLabel = documentStatusLabelForType;
  protected readonly statusDisplayLabel = documentStatusDisplayLabel;
  protected readonly statusDisplayTone = documentStatusDisplayTone;
  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;

  private readonly refreshTick = signal(0);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly request = computed(() => ({
    id: this.params().get('id') ?? '',
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) =>
        this.service.getDocumentById(id).pipe(
          map((document): DetailState => ({ status: 'success', document })),
          startWith<DetailState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.errorToState(err))),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies DetailState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly notFound = computed(() => this.state().status === 'not-found');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly document = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.document : null;
  });

  protected readonly title = computed(() => {
    const doc = this.document();
    if (!doc) {
      return 'Documento';
    }
    return `${documentTypeLabel(doc.type)} · ${documentReferenceLabel(doc.type, doc.reference, doc.series)}`;
  });

  protected readonly lines = computed(() => this.document()?.lines ?? []);

  protected readonly facts = computed<readonly DetailFact[]>(() => {
    const doc = this.document();
    if (!doc) {
      return [];
    }
    const facts: DetailFact[] = [
      { label: 'Tipo', value: documentTypeLabel(doc.type) },
      { label: 'Serie', value: doc.series },
      { label: 'Data documento', value: formatDate(doc.documentDate), numeric: true },
    ];
    if (doc.supplierName) {
      facts.push({ label: 'Fornitore', value: doc.supplierName });
    }
    if (doc.customerName) {
      facts.push({ label: 'Cliente', value: doc.customerName });
    }
    if (isTransferDocumentType(doc.type)) {
      const originName = this.locationLabel(doc.locationId);
      const targetName = this.locationLabel(doc.targetLocationId);
      if (originName) {
        facts.push({ label: 'Origine', value: originName });
      }
      if (targetName) {
        facts.push({ label: 'Destinazione', value: targetName });
      }
    }
    if (isStockOperationDocumentType(doc.type)) {
      const locationName = this.locationLabel(doc.locationId);
      if (locationName) {
        facts.push({ label: 'Sede', value: locationName });
      }
      if (isAdjustmentDocumentType(doc.type) && doc.adjustmentDirection) {
        facts.push({
          label: 'Direzione',
          value:
            doc.adjustmentDirection === AdjustmentDirection.Increase
              ? 'Aumento giacenza'
              : 'Diminuzione giacenza',
        });
      }
      if (doc.internalComment) {
        facts.push({ label: 'Motivo', value: doc.internalComment, wide: true });
      }
    }
    if (isSalesDdtDocumentType(doc.type)) {
      const locationName = this.locationLabel(doc.locationId);
      if (locationName) {
        facts.push({ label: 'Location origine', value: locationName });
      }
    }
    if (doc.billingCause) {
      facts.push({ label: 'Causale', value: doc.billingCause });
    }
    // Documento della controparte (tipo + numero + data): una voce sola, e solo
    // se almeno uno dei tre campi è compilato.
    const counterpartyDoc = counterpartyDocLabel(doc);
    if (counterpartyDoc) {
      facts.push({ label: 'Documento controparte', value: counterpartyDoc });
    }
    if (doc.externalRef && !doc.linkedSalesOrder) {
      facts.push({ label: 'Riferimento collegato', value: doc.externalRef });
    }
    if (doc.linkedSalesOrder) {
      facts.push({
        label: 'Ordine Shopify',
        value: doc.linkedSalesOrder.orderNumber,
        numeric: true,
        href: `/app/sales/${doc.linkedSalesOrder.id}`,
        linkLabel: 'Apri vendita',
      });
    }
    if (doc.linkedSupplierOrder) {
      facts.push({
        label: 'Ordine fornitore',
        value: doc.linkedSupplierOrder.reference,
        numeric: true,
        href: `/app/orders/${doc.linkedSupplierOrder.id}`,
        linkLabel: 'Apri ordine',
      });
    }
    const src = doc.sourceDocument;
    if (src) {
      facts.push({
        label: 'Nato da',
        value: `${documentTypeLabel(src.type)} · ${documentReferenceLabel(src.type, src.reference ?? undefined, src.series ?? '')}`,
        href: `/app/documents/${src.id}`,
        linkLabel: 'Apri documento',
      });
    }
    for (const derived of doc.derivedDocuments ?? []) {
      facts.push({
        label: 'Ha generato',
        value: `${documentTypeLabel(derived.type)} · ${documentReferenceLabel(derived.type, derived.reference ?? undefined, derived.series ?? '')}`,
        href: `/app/documents/${derived.id}`,
        linkLabel: 'Apri documento',
      });
    }
    facts.push({ label: 'Valuta', value: doc.currency });
    if (doc.externallyIssuedAt) {
      facts.push({
        label: 'Emessa esternamente il',
        value: formatDate(doc.externallyIssuedAt),
        numeric: true,
      });
    }
    if (doc.registrationDate) {
      facts.push({
        label: 'Registrato il',
        value: formatDate(doc.registrationDate),
        numeric: true,
      });
    }
    facts.push({ label: 'Creato da', value: doc.createdByName });
    facts.push({ label: 'Creato il', value: formatDate(doc.createdAt), numeric: true });
    if (doc.notes) {
      facts.push({ label: 'Note', value: doc.notes, wide: true });
    }
    return facts;
  });

  /**
   * Azioni del documento aperto (modifica, annulla, elimina, converti): la
   * famiglia del SUO tipo, non «almeno una famiglia». Finché il documento non
   * è caricato non si promette nulla.
   */
  protected readonly canManage = computed(() =>
    canManageDocumentType(this.authService.currentUser(), this.document()?.type ?? null),
  );

  protected readonly canPrintLabels = computed(() => {
    const doc = this.document();
    return (
      this.canManage() &&
      doc != null &&
      isGoodsReceiptDocumentType(doc.type) &&
      doc.status !== DocumentStatus.Cancelled &&
      doc.status !== DocumentStatus.Draft &&
      (doc.lines?.some((line) => line.variantId && line.loadsStock && line.quantity > 0) ?? false)
    );
  });
  protected readonly canCancel = computed(() => {
    const doc = this.document();
    if (!doc || isStoreFlowDocumentType(doc.type)) {
      // ⛔ Vendita e Reso al banco: **si eliminano, non si annullano**
      // (`11` A2). Il documento è l'unica evidenza dell'operazione, e un
      // annullato che resta a storico occuperebbe un numero senza dire nulla.
      return false;
    }
    // Vendita manuale (prompt Vendita manuale): niente annullamento — si
    // elimina dall'elenco e le giacenze già scalate NON vengono ripristinate.
    if (isManualUnloadDocumentType(doc.type)) {
      return false;
    }
    return this.canManage() && doc.status !== DocumentStatus.Cancelled;
  });
  protected readonly canDelete = computed(() => {
    const doc = this.document();
    if (!doc) {
      return false;
    }
    // ⭐ Vendita e Reso al banco: nascono confermati e si eliminano in
    // qualunque stato (`11` A2, passo 14). L'API toglie i movimenti collegati
    // alle righe e restituisce la merce; il Registro Corrispettivi, che li
    // legge dai documenti, si aggiorna da sé.
    if (isStoreFlowDocumentType(doc.type)) {
      return this.canManage();
    }
    // Vendita manuale: eliminabile in qualunque stato (definitiva solo sul
    // documento, mai sulle giacenze — prompt Vendita manuale).
    if (isManualUnloadDocumentType(doc.type)) {
      return this.canManage();
    }
    return (
      this.canManage() &&
      (doc.status === DocumentStatus.Draft || doc.status === DocumentStatus.Cancelled)
    );
  });

  /** Vendita manuale: l'eliminazione NON ripristina le giacenze già scalate. */
  protected readonly deleteDialogMessage = computed(() => {
    const doc = this.document();
    if (doc && isStoreFlowDocumentType(doc.type)) {
      return (
        'Il documento verrà eliminato definitivamente e le giacenze che aveva ' +
        'movimentato torneranno com’erano. Procedere?'
      );
    }
    if (doc && isManualUnloadDocumentType(doc.type)) {
      return (
        'La vendita manuale verrà eliminata definitivamente. Le giacenze già ' +
        'scalate NON verranno ripristinate. Procedere?'
      );
    }
    return 'Il documento verrà eliminato definitivamente. Procedere?';
  });

  /** Duplica documento (§2a): disponibile per tutti i tipi tranne vendite/resi al banco. */
  protected readonly canDuplicate = computed(() => {
    const doc = this.document();
    return this.canManage() && doc != null && !isStoreFlowDocumentType(doc.type);
  });

  protected readonly canEdit = computed(() => {
    const doc = this.document();
    if (!this.canManage() || !doc) {
      return false;
    }
    if (isGoodsReceiptDocumentType(doc.type)) {
      if (doc.status === DocumentStatus.Draft) {
        return true;
      }
      return isConfirmedEditableDocumentStatus(doc.status);
    }
    if (isTransferDocumentType(doc.type)) {
      if (doc.status === DocumentStatus.Draft) {
        return true;
      }
      return isConfirmedEditableDocumentStatus(doc.status);
    }
    if (isStockOperationDocumentType(doc.type)) {
      if (doc.status === DocumentStatus.Draft) {
        return true;
      }
      return isConfirmedEditableDocumentStatus(doc.status);
    }
    if (isSalesFormDocumentType(doc.type)) {
      if (doc.linkedSalesOrder) {
        return false;
      }
      if (doc.status === DocumentStatus.Draft) {
        return true;
      }
      return isConfirmedEditableDocumentStatus(doc.status);
    }
    // Preventivo e DDT vendita: si modificano dalla maschera dedicata (layout
    // Ordine cliente), da confermati previo sblocco. Il DDT gestisce nativamente
    // gli ordini agganciati, quindi il collegamento non impedisce la modifica.
    if (isQuoteDocumentType(doc.type) || isSalesDdtDocumentType(doc.type)) {
      if (doc.status === DocumentStatus.Draft) {
        return true;
      }
      return isConfirmedEditableDocumentStatus(doc.status);
    }
    return false;
  });

  /**
   * Condizione di documento per la generazione: una proforma già emessa e non
   * annullata. Il permesso non sta qui — dipende da COSA si genera.
   */
  private readonly convertSourceReady = computed(() => {
    const doc = this.document();
    return (
      doc != null &&
      isProformaDocumentType(doc.type) &&
      doc.status !== DocumentStatus.Cancelled &&
      doc.status !== DocumentStatus.Draft
    );
  });

  /**
   * Gate storico della generazione (famiglia del documento aperto): resta per
   * l'anteprima dedicata che eredita da questo componente. Qui i due comandi
   * usano il permesso della famiglia che verrebbe CREATA — vedi sotto.
   */
  protected readonly canConvert = computed(() => this.canManage() && this.convertSourceReady());

  /**
   * «Converti in fattura»: chi non gestisce le fatture non vede il
   * comando, anche se la proforma da cui parte è sua.
   */
  protected readonly canConvertToInvoice = computed(
    () =>
      this.convertSourceReady() && canManageDocFamily(this.authService.currentUser(), 'invoice'),
  );

  /** «Converti in DDT vendita»: stesso criterio, sulla famiglia DDT di vendita. */
  protected readonly canConvertToSalesDdt = computed(
    () =>
      this.convertSourceReady() && canManageDocFamily(this.authService.currentUser(), 'sales_ddt'),
  );

  protected readonly canOpenPrintPreview = computed(() => {
    const doc = this.document();
    return doc != null && isPrintableDocumentType(doc.type);
  });

  protected readonly editButtonLabel = computed(() => {
    const doc = this.document();
    if (!doc) {
      return 'Modifica documento';
    }
    // Etichetta col tipo nelle anteprime dedicate (stesso pattern di
    // «Modifica ordine» nell'anteprima Ordine cliente).
    if (isSalesDdtDocumentType(doc.type)) {
      return 'Modifica DDT';
    }
    if (isQuoteDocumentType(doc.type)) {
      return 'Modifica preventivo';
    }
    if (isProformaDocumentType(doc.type)) {
      return 'Modifica proforma';
    }
    if (isInvoiceDocumentType(doc.type)) {
      return 'Modifica fattura';
    }
    if (doc.status === DocumentStatus.Draft) {
      return 'Modifica bozza';
    }
    return 'Modifica documento';
  });

  private readonly revisionsRequest = computed(() => {
    const doc = this.document();
    const id = doc?.id ?? '';
    const shouldLoad =
      Boolean(id) &&
      doc != null &&
      doc.status !== DocumentStatus.Draft &&
      (isGoodsReceiptDocumentType(doc.type) ||
        isTransferDocumentType(doc.type) ||
        isStockOperationDocumentType(doc.type) ||
        isSalesDdtDocumentType(doc.type));
    return { id, tick: this.refreshTick(), shouldLoad };
  });

  private readonly revisionsState = toSignal(
    toObservable(this.revisionsRequest).pipe(
      switchMap(({ id, shouldLoad }) => {
        if (!shouldLoad) {
          return of<readonly DocumentRevision[]>([]);
        }
        return this.service.getRevisions(id).pipe(catchError(() => of([])));
      }),
    ),
    { initialValue: [] as readonly DocumentRevision[] },
  );

  protected readonly revisions = computed(() => this.revisionsState());
  protected readonly hasRevisions = computed(() => this.revisions().length > 0);

  private readonly _actionState = signal<ActionState>({ status: 'idle' });
  protected readonly actionSaving = computed(() => this._actionState().status === 'saving');
  protected readonly actionError = computed(() => {
    const state = this._actionState();
    return state.status === 'error' ? state.error : null;
  });

  protected readonly cancelDialogOpen = signal(false);
  protected readonly deleteDialogOpen = signal(false);

  private actionSubscription: Subscription | null = null;

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected goToList(): void {
    void this.router.navigateByUrl(this.listPath());
  }

  protected editDocument(): void {
    const doc = this.document();
    if (!doc) {
      return;
    }
    void this.router.navigateByUrl(documentEditPath(doc));
  }

  protected openPrintPreview(): void {
    const doc = this.document();
    if (!doc) {
      return;
    }
    void this.router.navigate(['/app/documents', doc.id, 'print']);
  }

  protected readonly downloadingPdf = signal(false);

  /** «Scarica XML»: solo fatture — l'XML FatturaPA non esiste per altri tipi. */
  protected readonly canDownloadXml = computed(() => {
    const doc = this.document();
    return doc != null && isSalesInvoiceDocumentType(doc.type);
  });

  protected readonly downloadingXml = signal(false);

  protected downloadDocumentXml(): void {
    const doc = this.document();
    if (!doc || this.downloadingXml()) {
      return;
    }
    this.downloadingXml.set(true);
    this.service
      .exportXml(doc.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadingXml.set(false);
          const reference = documentReferenceLabel(doc.type, doc.reference, doc.series);
          this.downloadBlob(blob, `${reference}.xml`);
        },
        error: (err: unknown) => {
          this.downloadingXml.set(false);
          this._actionState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  // ── Avviso pre-stampa (§AVVISI): dati trasporto/indirizzi incompleti ────
  // Il PDF scaricato dal dettaglio non passa dall'anteprima, quindi l'avviso
  // va agganciato anche qui: è il foglio che accompagna la merce. Mai
  // bloccante — l'operatore può scaricare comunque.

  protected readonly incompletePrintDialogOpen = signal(false);
  protected readonly incompletePrintMessage = TRANSPORT_INCOMPLETE_MESSAGE;
  protected readonly incompletePrintTitle = TRANSPORT_INCOMPLETE_TITLE;

  protected confirmIncompletePrint(): void {
    this.incompletePrintDialogOpen.set(false);
    this.runPdfDownload();
  }

  protected dismissIncompletePrint(): void {
    this.incompletePrintDialogOpen.set(false);
  }

  protected downloadDocumentPdf(): void {
    const doc = this.document();
    if (!doc || this.downloadingPdf()) {
      return;
    }
    if (transportDataIncomplete(doc.type, doc)) {
      this.incompletePrintDialogOpen.set(true);
      return;
    }
    this.runPdfDownload();
  }

  private runPdfDownload(): void {
    const doc = this.document();
    if (!doc || this.downloadingPdf()) {
      return;
    }
    this.downloadingPdf.set(true);
    this.service
      .exportPdf(doc.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadingPdf.set(false);
          const reference = documentReferenceLabel(doc.type, doc.reference, doc.series);
          const stamp = doc.documentDate.slice(0, 10);
          this.downloadBlob(blob, `documento-${reference}-${stamp}.pdf`);
        },
        error: (err: unknown) => {
          this.downloadingPdf.set(false);
          this._actionState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.replace(/[^\w\s.-]/g, '-');
    anchor.click();
    URL.revokeObjectURL(url);
  }

  protected convertToInvoice(): void {
    this.runConvert(DocumentType.Invoice);
  }

  protected convertToSalesDdt(): void {
    this.runConvert(DocumentType.SalesDdt);
  }

  private runConvert(targetType: DocumentType): void {
    const doc = this.document();
    if (!doc) {
      return;
    }
    // Generazione = «apre il form di destinazione precompilato»: non si crea
    // nulla a monte, si naviga al form nuovo con l'origine da cui precompilare.
    const targetRoute = this.convertTargetRoute(targetType);
    if (targetRoute) {
      void this.router.navigate([targetRoute], { queryParams: { fromDocument: doc.id } });
    }
  }

  private convertTargetRoute(targetType: DocumentType): string | null {
    switch (targetType) {
      case DocumentType.Invoice:
        return '/app/documents/fattura/new';
      case DocumentType.Proforma:
        return '/app/documents/proforma/new';
      case DocumentType.SalesDdt:
        return '/app/documents/sales-ddt/new';
      default:
        return null;
    }
  }

  protected requestCancel(): void {
    this.cancelDialogOpen.set(true);
  }
  protected requestDelete(): void {
    this.deleteDialogOpen.set(true);
  }

  protected printLabels(): void {
    const doc = this.document();
    if (!doc?.lines) {
      return;
    }
    this.labelPrintService
      .printFromDocumentLines(
        doc.lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
        })),
      )
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  protected cancelDocument(): void {
    this.cancelDialogOpen.set(false);
    this.runAction((id) => this.service.cancelDocument(id));
  }

  /**
   * Duplica documento (§2a). Fase 3 (no bozze): apre il form nuovo precompilato
   * (`?duplicateFrom`), senza creare nulla; la copia si crea (confermata) solo
   * al salvataggio, con la controparte scelta nel form.
   */
  protected duplicateDocument(): void {
    const doc = this.document();
    if (!doc) {
      return;
    }
    const duplicateRoute = documentDuplicateFormRoute(doc.type);
    if (duplicateRoute) {
      void this.router.navigate([duplicateRoute], { queryParams: { duplicateFrom: doc.id } });
    }
  }

  protected deleteDocument(): void {
    this.deleteDialogOpen.set(false);
    const doc = this.document();
    if (!doc || this.actionSaving()) {
      return;
    }
    this._actionState.set({ status: 'saving' });
    this.actionSubscription = this.service
      .deleteDocument(doc.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._actionState.set({ status: 'idle' });
          void this.router.navigateByUrl(this.listPath());
        },
        error: (err: unknown) => {
          this._actionState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  private runAction(action: (id: string) => Observable<DocumentRecord>): void {
    const doc = this.document();
    if (!doc || this.actionSaving()) {
      return;
    }
    this._actionState.set({ status: 'saving' });
    this.actionSubscription = action(doc.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._actionState.set({ status: 'idle' });
          this.reload();
        },
        error: (err: unknown) => {
          this._actionState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  private locationLabel(locationId: string | undefined): string | null {
    if (!locationId) {
      return null;
    }
    const all = [
      ...this.operationalLocations.locations(),
      ...this.operationalLocations.transferTargetLocations(),
    ];
    return all.find((loc) => loc.id === locationId)?.name ?? null;
  }

  private errorToState(err: unknown): DetailState {
    const appError = this.toAppError(err);
    if (appError.kind === AppErrorKind.NotFound) {
      return { status: 'not-found' };
    }
    return { status: 'error', error: appError };
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
