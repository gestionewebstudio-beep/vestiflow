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
import { canManageDocuments } from '@core/permissions/tenant-permissions.util';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
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
} from './models/document-labels.util';
import { isGoodsReceiptDocumentType } from './models/document-goods-receipt.util';
import { isPrintableDocumentType } from './models/document-print.util';
import { documentEditPath } from './models/document-routing.util';
import { isTransferDocumentType } from './models/document-transfer.util';
import {
  isAdjustmentDocumentType,
  isManualUnloadDocumentType,
  isStockOperationDocumentType,
} from './models/document-stock-operation.util';
import { isStoreFlowDocumentType } from './models/document-operational.util';
import {
  isInvoiceDraftDocumentType,
  isProformaDocumentType,
  isQuoteDocumentType,
  isSalesDdtDocumentType,
  isSalesFormDocumentType,
  isSalesInvoiceDocumentType,
} from './models/document-sales.util';
import {
  TRANSPORT_INCOMPLETE_MESSAGE,
  TRANSPORT_INCOMPLETE_TITLE,
  transportDataIncomplete,
} from './models/document-transport.util';
import { DocumentService } from './services/document.service';
import { ProductLabelPrintService } from '@features/products/services/product-label-print.service';
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
 * Tipi documento che espongono l'azione «Inviata al commercialista»
 * (registrazione esterna). Nessun altro tipo mostra azioni di ciclo di vita
 * fiscale: per abilitarne uno nuovo basta aggiungerlo a questo elenco.
 */
const EXTERNAL_REGISTRATION_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.InvoiceDraft,
  DocumentType.InvoiceAccompanying,
  DocumentType.Proforma,
] as const;

function supportsExternalRegistration(type: DocumentType): boolean {
  return (EXTERNAL_REGISTRATION_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/** Etichetta dell'azione e testo del dialogo di conferma (unico per tutti i tipi). */
const EXTERNAL_REGISTRATION_LABEL = 'Inviata al commercialista';
const EXTERNAL_REGISTRATION_MESSAGE =
  'Segna questo documento come inviato al commercialista per la registrazione.';

/**
 * Dettaglio documento (smart, sola lettura). Espone le transizioni di stato
 * (conferma, annullamento, eliminazione) con dialogo per le azioni sensibili.
 * L'unica azione di ciclo di vita fiscale è «Inviata al commercialista», e
 * solo per i tipi in EXTERNAL_REGISTRATION_DOCUMENT_TYPES.
 */
@Component({
  selector: 'app-document-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
        facts.push({ label: 'Location', value: locationName });
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
    facts.push({ label: 'Valuta', value: doc.currency });
    if (doc.externallyIssuedAt) {
      facts.push({
        label: 'Emessa esternamente il',
        value: formatDate(doc.externallyIssuedAt),
        numeric: true,
      });
    }
    if (doc.externalDocNumber) {
      facts.push({ label: 'Doc. esterno', value: doc.externalDocNumber });
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

  protected readonly canManage = computed(() => canManageDocuments(this.authService.currentUser()));

  // Percorso unico Arrivo merce: la famiglia carico si conferma SOLO con
  // «Salva documento» nel form dedicato (il backend rifiuta comunque il
  // confirm generico per questi tipi).
  protected readonly canConfirm = computed(() => {
    const doc = this.document();
    return (
      this.canManage() &&
      doc?.status === DocumentStatus.Draft &&
      !isGoodsReceiptDocumentType(doc.type)
    );
  });
  /**
   * «Inviata al commercialista» (registrazione esterna): unica azione di ciclo
   * di vita fiscale esposta, e solo per i tipi in
   * EXTERNAL_REGISTRATION_DOCUMENT_TYPES. Gli altri documenti non mostrano
   * alcuna azione di stato.
   *
   * Gli stati Stampato/Inviato non sono più raggiungibili dall'interfaccia ma
   * restano ammessi qui per i documenti storici già in quegli stati.
   */
  protected readonly canRegisterExternal = computed(() => {
    const doc = this.document();
    if (!this.canManage() || !doc || !supportsExternalRegistration(doc.type)) {
      return false;
    }
    return (
      doc.status === DocumentStatus.Confirmed ||
      doc.status === DocumentStatus.Printed ||
      doc.status === DocumentStatus.Sent
    );
  });

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
      // Vendite/resi negozio: registro consultabile, gestione solo dalla cassa.
      return false;
    }
    // Scarico manuale (prompt Scarico manuale): niente annullamento — si
    // elimina dall'elenco e le giacenze già scalate NON vengono ripristinate.
    if (isManualUnloadDocumentType(doc.type)) {
      return false;
    }
    return this.canManage() && doc.status !== DocumentStatus.Cancelled;
  });
  protected readonly canDelete = computed(() => {
    const doc = this.document();
    if (!doc || isStoreFlowDocumentType(doc.type)) {
      return false;
    }
    // Scarico manuale: eliminabile in qualunque stato (definitiva solo sul
    // documento, mai sulle giacenze — prompt Scarico manuale).
    if (isManualUnloadDocumentType(doc.type)) {
      return this.canManage();
    }
    return (
      this.canManage() &&
      (doc.status === DocumentStatus.Draft || doc.status === DocumentStatus.Cancelled)
    );
  });

  /** Scarico manuale: l'eliminazione NON ripristina le giacenze già scalate. */
  protected readonly deleteDialogMessage = computed(() => {
    const doc = this.document();
    if (doc && isManualUnloadDocumentType(doc.type)) {
      return (
        'Lo scarico manuale verrà eliminato definitivamente. Le giacenze già ' +
        'scalate NON verranno ripristinate. Procedere?'
      );
    }
    return 'Il documento verrà eliminato definitivamente. Procedere?';
  });

  /** Duplica documento (§2a): disponibile per tutti i tipi tranne vendite/resi negozio. */
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
      return isConfirmedEditableDocumentStatus(doc.status) && doc.blockAfterConfirm !== true;
    }
    if (isTransferDocumentType(doc.type)) {
      if (doc.status === DocumentStatus.Draft) {
        return true;
      }
      return isConfirmedEditableDocumentStatus(doc.status) && doc.blockAfterConfirm !== true;
    }
    if (isStockOperationDocumentType(doc.type)) {
      if (doc.status === DocumentStatus.Draft) {
        return true;
      }
      return isConfirmedEditableDocumentStatus(doc.status) && doc.blockAfterConfirm !== true;
    }
    if (isSalesFormDocumentType(doc.type)) {
      if (doc.linkedSalesOrder) {
        return false;
      }
      if (doc.status === DocumentStatus.Draft) {
        return true;
      }
      return isConfirmedEditableDocumentStatus(doc.status) && doc.blockAfterConfirm !== true;
    }
    // Preventivo e DDT vendita: si modificano dalla maschera dedicata (layout
    // Ordine cliente) finché non bloccati. Il DDT gestisce nativamente gli
    // ordini agganciati, quindi il collegamento non impedisce la modifica.
    if (isQuoteDocumentType(doc.type) || isSalesDdtDocumentType(doc.type)) {
      if (doc.status === DocumentStatus.Draft) {
        return true;
      }
      return isConfirmedEditableDocumentStatus(doc.status) && doc.blockAfterConfirm !== true;
    }
    return false;
  });

  protected readonly canConvert = computed(() => {
    const doc = this.document();
    return (
      this.canManage() &&
      doc != null &&
      isProformaDocumentType(doc.type) &&
      doc.status !== DocumentStatus.Cancelled &&
      doc.status !== DocumentStatus.Draft
    );
  });

  protected readonly canOpenPrintPreview = computed(() => {
    const doc = this.document();
    return doc != null && isPrintableDocumentType(doc.type);
  });

  protected readonly registerButtonLabel = EXTERNAL_REGISTRATION_LABEL;
  protected readonly registerDialogMessage = EXTERNAL_REGISTRATION_MESSAGE;

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
    if (isInvoiceDraftDocumentType(doc.type)) {
      return 'Modifica bozza fattura';
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

  protected readonly confirmDialogOpen = signal(false);
  protected readonly registerDialogOpen = signal(false);
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

  protected convertToInvoiceDraft(): void {
    this.runConvert(DocumentType.InvoiceDraft);
  }

  protected convertToSalesDdt(): void {
    this.runConvert(DocumentType.SalesDdt);
  }

  private runConvert(targetType: DocumentType): void {
    const doc = this.document();
    if (!doc || this.actionSaving()) {
      return;
    }
    this._actionState.set({ status: 'saving' });
    this.actionSubscription = this.service
      .convertDocument(doc.id, targetType)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this._actionState.set({ status: 'idle' });
          void this.router.navigate(['/app/documents', created.id]);
        },
        error: (err: unknown) => {
          this._actionState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected requestConfirm(): void {
    this.confirmDialogOpen.set(true);
  }
  protected requestRegister(): void {
    this.registerDialogOpen.set(true);
  }
  protected requestCancel(): void {
    this.cancelDialogOpen.set(true);
  }
  protected requestDelete(): void {
    this.deleteDialogOpen.set(true);
  }

  protected confirmDocument(): void {
    this.confirmDialogOpen.set(false);
    this.runAction((id) => this.service.confirmDocument(id));
  }

  /**
   * Registrazione esterna: numero e data del documento esterno restano quelli
   * già acquisiti sul documento, il dialogo è una semplice conferma.
   */
  protected registerExternal(): void {
    this.registerDialogOpen.set(false);
    this.runAction((id) => this.service.registerExternal(id, {}));
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

  /** Duplica documento (§2a): naviga alla copia appena creata, subito modificabile. */
  protected duplicateDocument(): void {
    const doc = this.document();
    if (!doc || this.actionSaving()) {
      return;
    }
    this._actionState.set({ status: 'saving' });
    this.actionSubscription = this.service
      .duplicateDocument(doc.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this._actionState.set({ status: 'idle' });
          void this.router.navigateByUrl(documentEditPath(created));
        },
        error: (err: unknown) => {
          this._actionState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
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
