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

import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
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
  imports: [RouterLink, DocumentLinesTableComponent, ErrorStateComponent, TableSkeletonComponent],
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

  protected print(): void {
    globalThis.print();
  }

  protected downloadPdf(): void {
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
