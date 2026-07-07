import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { DocumentRecord } from '@core/models/document.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import {
  documentReferenceLabel,
  documentStatusDisplayLabel,
  documentStatusDisplayTone,
  documentTypeLabel,
} from '../../models/document-labels.util';

/**
 * Tabella registro documenti (dumb puro). Row click verso il dettaglio; importi
 * a destra in tabular-nums; mobile come card impilate.
 */
@Component({
  selector: 'app-document-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './document-table.component.html',
  styleUrl: './document-table.component.scss',
})
export class DocumentTableComponent {
  readonly documents = input.required<readonly DocumentRecord[]>();
  readonly columns = input.required<readonly ResolvedTableColumn[]>();

  readonly rowClick = output<DocumentRecord>();

  protected readonly typeLabel = documentTypeLabel;
  protected readonly formatMoney = formatMoney;

  protected referenceLabel(doc: DocumentRecord): string {
    return documentReferenceLabel(doc.type, doc.reference, doc.series);
  }

  protected counterparty(doc: DocumentRecord): string {
    return doc.supplierName ?? doc.customerName ?? '—';
  }

  protected dateLabel(doc: DocumentRecord): string {
    return formatDate(doc.documentDate);
  }

  protected lineCount(doc: DocumentRecord): number {
    return doc.lineCount ?? doc.lines?.length ?? 0;
  }

  protected notesLabel(doc: DocumentRecord): string {
    return doc.internalComment?.trim() || doc.notes?.trim() || '—';
  }

  protected locationLabel(doc: DocumentRecord): string {
    return doc.locationName ?? '—';
  }

  protected externalDocLabel(doc: DocumentRecord): string {
    return doc.externalDocNumber?.trim() || doc.externalRef?.trim() || '—';
  }

  protected billingCauseLabel(doc: DocumentRecord): string {
    return doc.billingCause?.trim() || '—';
  }

  protected statusLabel(doc: DocumentRecord): string | null {
    return documentStatusDisplayLabel(doc.type, doc.status, doc);
  }

  protected statusTone(doc: DocumentRecord) {
    return documentStatusDisplayTone(doc.type, doc.status);
  }

  protected rowLabel(doc: DocumentRecord): string {
    return `Apri documento ${this.referenceLabel(doc)} (${this.typeLabel(doc.type)})`;
  }
}
