import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { TransportPort } from '@core/models/document.model';
import type { DocumentAddress } from '@core/models/document.model';
import { formatDate, formatDateTime } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { DetailFactsComponent } from '@shared/components/detail-facts/detail-facts.component';
import type { DetailFact } from '@shared/components/detail-facts/detail-facts.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { storeSalePaymentMethodLabel } from '@features/store-sales/models/store-sale-payment.util';

import { DocumentAttachmentsPanelComponent } from './components/document-attachments-panel/document-attachments-panel.component';
import { DocumentLinesTableComponent } from './components/document-lines-table/document-lines-table.component';
import { DocumentDetailComponent } from './document-detail.component';
import { documentReferenceLabel, documentTypeLabel } from './models/document-labels.util';
import { isStoreFlowDocumentType } from './models/document-operational.util';
import { salesDocumentRegisterConfig } from './models/document-sales-register.config';
import { isInvoiceDraftDocumentType, isSalesDdtDocumentType } from './models/document-sales.util';
import { isManualUnloadDocumentType } from './models/document-stock-operation.util';
import type { DocumentListProfile } from './models/document-list-query.model';

const TRANSPORT_PORT_LABELS: Record<TransportPort, string> = {
  [TransportPort.Franco]: 'Franco',
  [TransportPort.Assegnato]: 'Assegnato',
};

/**
 * Anteprima dettaglio dedicata dei documenti di vendita (Preventivi, Proforma,
 * DDT vendita, Bozze fattura): stesso layout a pannelli dell'anteprima Ordine
 * cliente, adattato ai campi specifici di ciascun tipo. Estende il dettaglio
 * documento generico per riusarne caricamento, permessi e transizioni di stato
 * (conferma, conversione, annullamento) senza duplicare logica.
 */
@Component({
  selector: 'app-sales-document-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
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
  templateUrl: './sales-document-detail.component.html',
  styleUrl: './sales-document-detail.component.scss',
})
export class SalesDocumentDetailComponent extends DocumentDetailComponent {
  private readonly detailRoute = inject(ActivatedRoute);
  private readonly detailRouter = inject(Router);

  private readonly detailRouteData = toSignal(this.detailRoute.data, {
    initialValue: this.detailRoute.snapshot.data,
  });

  protected readonly config = computed(() => {
    const profile =
      (this.detailRouteData()['documentListProfile'] as DocumentListProfile | undefined) ?? 'quote';
    return salesDocumentRegisterConfig(profile) ?? salesDocumentRegisterConfig('quote')!;
  });

  /** La navigazione «indietro» e post-eliminazione resta nella sezione dedicata. */
  protected override readonly listPath = computed(() => this.config().listPath);

  /**
   * Tipi ammessi dalla pagina: l'elenco condiviso ne dichiara più d'uno
   * (Fattura/Fattura accompagnatoria, Vendita/Reso negozio). Confrontare col
   * solo `type` scaccerebbe al registro generico i documenti dell'altro tipo.
   */
  private readonly allowedTypes = computed(() => {
    const config = this.config();
    return config.types ?? [config.type];
  });

  protected readonly referenceTitle = computed(() => {
    const doc = this.document();
    return doc ? documentReferenceLabel(doc.type, doc.reference, doc.series) : '';
  });

  /** Dati di testata specifici del tipo (pannello «Dati …»). */
  protected readonly documentFacts = computed<readonly DetailFact[]>(() => {
    const doc = this.document();
    if (!doc) {
      return [];
    }
    const facts: DetailFact[] = [
      { label: 'Data documento', value: formatDate(doc.documentDate), numeric: true },
    ];
    // Elenchi condivisi da più tipi: il tipo è un dato di testata, non un
    // dettaglio implicito nella pagina che si sta guardando.
    if (this.allowedTypes().length > 1) {
      facts.push({ label: 'Tipo', value: documentTypeLabel(doc.type) });
    }
    facts.push({ label: 'Cliente', value: doc.customerName ?? '—' });
    if (isStoreFlowDocumentType(doc.type) && doc.locationName) {
      facts.push({ label: 'Negozio', value: doc.locationName });
    }
    if (
      (isSalesDdtDocumentType(doc.type) || isManualUnloadDocumentType(doc.type)) &&
      doc.locationName
    ) {
      facts.push({
        label: isManualUnloadDocumentType(doc.type)
          ? 'Location di scarico'
          : 'Magazzino di origine',
        value: doc.locationName,
      });
    }
    if (doc.expectedDeliveryDate) {
      facts.push({
        label: 'Consegna prevista',
        value: formatDate(doc.expectedDeliveryDate),
        numeric: true,
      });
    }
    if (doc.paymentTerms) {
      facts.push({ label: 'Pagamento', value: doc.paymentTerms });
    }
    if (doc.paymentMethod) {
      // La cassa salva il codice grezzo (`cash`/`card`/`other`), i DDT lo
      // snapshot già leggibile della voce normativa: solo il primo va tradotto.
      facts.push(
        isStoreFlowDocumentType(doc.type)
          ? { label: 'Metodo pagamento', value: storeSalePaymentMethodLabel(doc.paymentMethod) }
          : { label: 'Modalità di pagamento', value: doc.paymentMethod },
      );
    }
    if (isSalesDdtDocumentType(doc.type) && doc.followedBySalesDoc) {
      facts.push({ label: 'Seguirà doc. di vendita', value: 'Sì' });
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
    for (const order of doc.linkedSalesOrders ?? []) {
      facts.push({
        label: 'Ordine cliente agganciato',
        value: order.orderNumber,
        numeric: true,
        href: `/app/sales/${order.id}`,
        linkLabel: 'Apri ordine',
      });
    }
    facts.push({ label: 'Valuta', value: doc.currency });
    if (isInvoiceDraftDocumentType(doc.type)) {
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
    }
    facts.push({ label: 'Creato da', value: doc.createdByName });
    facts.push({ label: 'Creato il', value: formatDate(doc.createdAt), numeric: true });
    if (doc.notes) {
      facts.push({ label: 'Note', value: doc.notes, wide: true });
    }
    return facts;
  });

  /** Testata operativa del trasporto (solo DDT vendita, prompt DDT). */
  protected readonly transportFacts = computed<readonly DetailFact[]>(() => {
    const doc = this.document();
    if (!doc || !isSalesDdtDocumentType(doc.type)) {
      return [];
    }
    const facts: DetailFact[] = [];
    if (doc.transportCausal) {
      facts.push({ label: 'Causale trasporto', value: doc.transportCausal });
    }
    if (doc.transportStartAt) {
      facts.push({
        label: 'Inizio trasporto',
        value: formatDateTime(doc.transportStartAt),
        numeric: true,
      });
    }
    if (doc.transportPort) {
      facts.push({ label: 'Porto', value: TRANSPORT_PORT_LABELS[doc.transportPort] });
    }
    if (doc.transportCarrier) {
      facts.push({ label: 'Trasporto a cura', value: doc.transportCarrier });
    }
    if (doc.transportPackagesCount != null) {
      facts.push({ label: 'Colli', value: String(doc.transportPackagesCount), numeric: true });
    }
    if (doc.transportWeight) {
      facts.push({ label: 'Peso', value: doc.transportWeight });
    }
    if (doc.transportGoodsAspect) {
      facts.push({ label: 'Aspetto beni', value: doc.transportGoodsAspect });
    }
    if (doc.transportShippingCode) {
      facts.push({ label: 'Codice spedizione', value: doc.transportShippingCode });
    }
    if (doc.transportTrackingCode) {
      facts.push({ label: 'Tracking', value: doc.transportTrackingCode });
    }
    return facts;
  });

  /** Snapshot indirizzi di testata (solo DDT vendita, prompt DDT §INDIRIZZI). */
  protected readonly addressFacts = computed<readonly DetailFact[]>(() => {
    const doc = this.document();
    if (!doc || !isSalesDdtDocumentType(doc.type)) {
      return [];
    }
    const facts: DetailFact[] = [];
    const recipient = formatDocumentAddress(doc.recipientAddress);
    if (recipient) {
      facts.push({ label: 'Intestatario', value: recipient, wide: true });
    }
    const destination = formatDocumentAddress(doc.destinationAddress);
    if (destination) {
      facts.push({ label: 'Destinazione merce', value: destination, wide: true });
    }
    return facts;
  });

  constructor() {
    super();
    // URL con l'id di un documento di altro tipo (link incollato): si apre il
    // dettaglio del registro generico invece di mostrare una pagina incoerente.
    effect(() => {
      const doc = this.document();
      if (doc && !this.allowedTypes().includes(doc.type)) {
        void this.detailRouter.navigate(['/app/documents', doc.id], { replaceUrl: true });
      }
    });
  }
}

/** Indirizzo snapshot su una riga leggibile ('' se del tutto vuoto). */
function formatDocumentAddress(address: DocumentAddress | undefined): string {
  if (!address) {
    return '';
  }
  const cityLine = [address.zip, address.city, address.province ? `(${address.province})` : '']
    .filter(Boolean)
    .join(' ');
  const fiscal = [
    address.fiscalCode ? `CF ${address.fiscalCode}` : '',
    address.vatNumber ? `P.IVA ${address.vatNumber}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return [address.name, address.address, cityLine, address.country, fiscal]
    .filter(Boolean)
    .join(' — ');
}
