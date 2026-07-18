import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { DocumentType } from '@core/models/document.model';
import type { DocumentAddress } from '@core/models/document.model';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { DocumentLinesTableComponent } from './components/document-lines-table/document-lines-table.component';
import { documentReferenceLabel, documentTypeLabel } from './models/document-labels.util';
import {
  isGoodsReceiptPrintType,
  isSalesPrintType,
  isTransferPrintType,
} from './models/document-print.util';
import { isProformaDocumentType } from './models/document-sales.util';
import { DocumentService } from './services/document.service';

const PROFORMA_DISCLAIMER = 'Documento non fiscale / Proforma non valida ai fini IVA.';

@Component({
  selector: 'app-document-print-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ConfirmDialogComponent,
    DocumentLinesTableComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './document-print-preview.component.html',
  styleUrl: './document-print-preview.component.scss',
})
export class DocumentPrintPreviewComponent {
  private readonly service = inject(DocumentService);
  private readonly route = inject(ActivatedRoute);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly downloadingPdf = signal(false);

  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;
  protected readonly proformaDisclaimer = PROFORMA_DISCLAIMER;

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly request = computed(() => this.params().get('id') ?? '');

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap((id) =>
        this.service.getDocumentById(id).pipe(
          map((document) => ({ status: 'success' as const, document })),
          startWith({ status: 'loading' as const }),
          catchError(() => of({ status: 'error' as const })),
        ),
      ),
    ),
    { initialValue: { status: 'loading' as const } },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly error = computed(() => this.state().status === 'error');

  protected readonly document = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.document : null;
  });

  protected readonly title = computed(() => {
    const doc = this.document();
    if (!doc) {
      return 'Documento';
    }
    return doc.printTitle ?? documentTypeLabel(doc.type);
  });

  protected readonly reference = computed(() => {
    const doc = this.document();
    if (!doc) {
      return '';
    }
    return documentReferenceLabel(doc.type, doc.reference, doc.series);
  });

  protected readonly showProformaDisclaimer = computed(() => {
    const doc = this.document();
    return doc != null && isProformaDocumentType(doc.type);
  });

  protected readonly printKind = computed(() => {
    const doc = this.document();
    if (!doc) {
      return 'generic' as const;
    }
    if (isTransferPrintType(doc.type)) {
      return 'transfer' as const;
    }
    if (isGoodsReceiptPrintType(doc.type)) {
      return 'goods_receipt' as const;
    }
    if (isSalesPrintType(doc.type)) {
      return 'sales' as const;
    }
    return 'generic' as const;
  });

  protected locationLabel(locationId: string | undefined): string | null {
    if (!locationId) {
      return null;
    }
    const all = [
      ...this.operationalLocations.locations(),
      ...this.operationalLocations.transferTargetLocations(),
    ];
    return all.find((loc) => loc.id === locationId)?.name ?? null;
  }

  // ── DDT vendita: trasporto e indirizzi in anteprima (prompt DDT) ────────

  /** Righe etichetta/valore del trasporto (solo campi compilati, solo DDT). */
  protected readonly transportRows = computed<readonly (readonly [string, string])[]>(() => {
    const doc = this.document();
    if (!doc || doc.type !== DocumentType.SalesDdt) {
      return [];
    }
    const rows: (readonly [string, string])[] = [];
    if (doc.transportCausal?.trim()) {
      rows.push(['Causale trasporto', doc.transportCausal.trim()]);
    }
    if (doc.transportStartAt) {
      const time = doc.transportStartAt.length >= 16 ? doc.transportStartAt.slice(11, 16) : '';
      rows.push([
        'Inizio trasporto',
        `${formatDate(doc.transportStartAt)}${time && time !== '00:00' ? ` ${time}` : ''}`,
      ]);
    }
    if (doc.transportPort) {
      rows.push(['Porto', doc.transportPort === 'franco' ? 'Franco' : 'Assegnato']);
    }
    if (doc.transportCarrier?.trim()) {
      rows.push(['Incaricato trasporto', doc.transportCarrier.trim()]);
    }
    if (doc.transportPackagesCount != null) {
      rows.push(['Numero colli', String(doc.transportPackagesCount)]);
    }
    if (doc.transportWeight?.trim()) {
      rows.push(['Peso', doc.transportWeight.trim()]);
    }
    if (doc.transportGoodsAspect?.trim()) {
      rows.push(['Aspetto beni', doc.transportGoodsAspect.trim()]);
    }
    if (doc.transportShippingCode?.trim()) {
      rows.push(['Codice spedizione', doc.transportShippingCode.trim()]);
    }
    if (doc.transportTrackingCode?.trim()) {
      rows.push(['Tracking', doc.transportTrackingCode.trim()]);
    }
    if (doc.paymentMethod?.trim()) {
      rows.push(['Pagamento', doc.paymentMethod.trim()]);
    }
    if (doc.followedBySalesDoc) {
      rows.push(['Seguirà doc. di vendita', 'Sì']);
    }
    return rows;
  });

  private addressLines(address: DocumentAddress | undefined): readonly string[] {
    if (!address) {
      return [];
    }
    const cityLine = [address.zip, address.city, address.province]
      .filter((part) => part?.trim())
      .join(' ');
    const fiscalLine = [
      address.fiscalCode?.trim() ? `CF: ${address.fiscalCode.trim()}` : '',
      address.vatNumber?.trim() ? `P.IVA: ${address.vatNumber.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return [address.name, address.address, cityLine, address.country, fiscalLine].filter(
      (line): line is string => Boolean(line?.trim()),
    );
  }

  protected readonly recipientAddressLines = computed(() => {
    const doc = this.document();
    return doc?.type === DocumentType.SalesDdt ? this.addressLines(doc.recipientAddress) : [];
  });

  protected readonly destinationAddressLines = computed(() => {
    const doc = this.document();
    if (doc?.type !== DocumentType.SalesDdt || !doc.destinationAddress) {
      return [];
    }
    const destination = this.addressLines(doc.destinationAddress);
    const recipient = this.addressLines(doc.recipientAddress);
    // Destinazione coincidente con l'intestatario: si stampa una volta sola.
    return destination.join('\n') === recipient.join('\n') ? [] : destination;
  });

  // ── Avviso pre-stampa DDT (prompt DDT §AVVISI): dati trasporto/indirizzi ──

  protected readonly incompletePrintDialogOpen = signal(false);
  private pendingPrintAction: 'print' | 'pdf' | null = null;

  /** DDT vendita con dati trasporto o indirizzi non compilati. */
  private ddtDataIncomplete(): boolean {
    const doc = this.document();
    if (!doc || doc.type !== DocumentType.SalesDdt) {
      return false;
    }
    const transportIncomplete =
      !doc.transportCausal?.trim() ||
      !doc.transportPort ||
      !doc.transportCarrier?.trim() ||
      doc.transportPackagesCount == null ||
      !doc.transportGoodsAspect?.trim();
    const addressIncomplete = (address: DocumentAddress | undefined): boolean =>
      !address?.name?.trim() || !address.address?.trim() || !address.city?.trim();
    return (
      transportIncomplete ||
      addressIncomplete(doc.recipientAddress) ||
      addressIncomplete(doc.destinationAddress ?? doc.recipientAddress)
    );
  }

  protected confirmIncompletePrint(): void {
    this.incompletePrintDialogOpen.set(false);
    const action = this.pendingPrintAction;
    this.pendingPrintAction = null;
    if (action === 'print') {
      globalThis.print();
    } else if (action === 'pdf') {
      this.runPdfDownload();
    }
  }

  protected dismissIncompletePrint(): void {
    this.incompletePrintDialogOpen.set(false);
    this.pendingPrintAction = null;
  }

  protected print(): void {
    if (this.ddtDataIncomplete()) {
      this.pendingPrintAction = 'print';
      this.incompletePrintDialogOpen.set(true);
      return;
    }
    globalThis.print();
  }

  protected downloadPdf(): void {
    if (this.ddtDataIncomplete()) {
      this.pendingPrintAction = 'pdf';
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
        error: () => {
          this.downloadingPdf.set(false);
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
}
