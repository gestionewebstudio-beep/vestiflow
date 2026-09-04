import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AdjustmentDirection, DocumentType } from '@core/models/document.model';
import type { DocumentAddress } from '@core/models/document.model';
import { storeSalePaymentMethodLabelWithNote } from '@domain/store-sales/models/store-sale-payment.util';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { DocumentLinesTableComponent } from './components/document-lines-table/document-lines-table.component';
import {
  documentReferenceLabel,
  documentTypeLabel,
} from '@domain/documents/models/document-labels.util';
import {
  documentPrintDisclaimer,
  documentPrintKind,
  documentPrintShowsValues,
} from './models/document-print.util';
import {
  TRANSPORT_INCOMPLETE_MESSAGE,
  TRANSPORT_INCOMPLETE_TITLE,
  documentTravelsWithGoods,
  transportDataIncomplete,
} from '@domain/documents/models/document-transport.util';
import { DocumentService } from '@domain/documents/services/document.service';
import { counterpartyDocLabel } from '@domain/documents/models/document-labels.util';

@Component({
  selector: 'app-document-print-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackButtonComponent,
    ConfirmDialogComponent,
    DocumentLinesTableComponent,
    ErrorStateComponent,
    InlineBannerComponent,
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

  /**
   * Errore dello scarico PDF. Era ingoiato: delle tre viste che scaricano, era
   * l'unica a non dire niente — il dettaglio e la lista mostrano il messaggio.
   */
  protected readonly downloadError = signal<string | null>(null);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly request = computed(() => this.params().get('id') ?? '');

  /**
   * Ritorno senza cronologia: parentRoute scarterebbe 'print' e l'id arrivando
   * all'hub Documenti, ma la pagina sensata è il dettaglio del documento.
   */
  protected readonly detailPath = computed(() => `/app/documents/${this.request()}`);

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

  /**
   * Intestazione emittente: la stessa che finirà sul PDF, composta dal server.
   * L'anteprima non la mostrava affatto — chi la guardava non vedeva ragione
   * sociale, indirizzo e partita IVA, cioè proprio la parte che distingue un
   * documento dell'azienda da un foglio qualsiasi.
   *
   * Se la chiamata fallisce l'anteprima resta senza testata invece di rompersi:
   * il resto del foglio è comunque utile, e il PDF ce l'avrà lo stesso.
   */
  private readonly printHeaderState = toSignal(
    toObservable(this.request).pipe(
      switchMap((id) =>
        id ? this.service.getPrintHeader(id).pipe(catchError(() => of(null))) : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected readonly printHeader = computed(() => this.printHeaderState());

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

  /**
   * Documento della controparte in testata (tipo + numero + data): '' quando
   * non è compilato, così il foglio non porta una riga vuota.
   */
  protected readonly counterpartyDoc = computed(() => {
    const doc = this.document();
    return doc ? counterpartyDocLabel(doc) : '';
  });

  /** Avviso «non fiscale»: proforma e vendita al banco. Assente per gli altri. */
  protected readonly disclaimer = computed(() => {
    const doc = this.document();
    return doc ? documentPrintDisclaimer(doc.type) : null;
  });

  protected readonly printKind = computed(() => {
    const doc = this.document();
    return doc ? documentPrintKind(doc.type) : ('generic' as const);
  });

  /**
   * Colonne di valore e blocco totali. L'anteprima e il PDF leggono lo stesso
   * predicato apposta: è questa simmetria a impedire che i due fogli dicano
   * cose diverse sullo stesso documento.
   */
  protected readonly showsValues = computed(() => {
    const doc = this.document();
    return doc != null && documentPrintShowsValues(doc.type);
  });

  /**
   * Direzione della rettifica. Stesso testo del dettaglio a schermo: il foglio
   * e la maschera non devono chiamare le cose in due modi.
   */
  protected readonly adjustmentDirectionLabel = computed(() => {
    const direction = this.document()?.adjustmentDirection;
    if (!direction) {
      return null;
    }
    return direction === AdjustmentDirection.Increase ? 'Aumento giacenza' : 'Diminuzione giacenza';
  });

  /**
   * Sede sui documenti di vendita: vendita manuale e vendita al banco. Sulla
   * vendita al banco è spesso l'unico contesto, perché il cliente può mancare.
   */
  protected readonly showsLocation = computed(() => {
    const type = this.document()?.type;
    return (
      type === DocumentType.ManualUnload ||
      type === DocumentType.StoreSale ||
      type === DocumentType.StoreReturn
    );
  });

  /** Metodo di pagamento della cassa: il documento salva il codice grezzo. */
  protected readonly storePaymentLabel = computed(() => {
    const doc = this.document();
    if (!doc || doc.type !== DocumentType.StoreSale || !doc.paymentMethod) {
      return null;
    }
    return storeSalePaymentMethodLabelWithNote(doc.paymentMethod, doc.paymentMethodNote);
  });

  /** Chi ha eseguito: solo sui movimenti interni di magazzino. */
  protected readonly showsOperator = computed(() => {
    const kind = this.printKind();
    return kind === 'transfer' || kind === 'stock';
  });

  // ── Registrazione fattura fornitore ───────────────────────────────────
  // Le stesse sezioni che il PDF stampa in coda. L'anteprima deve dire ciò
  // che il foglio dirà: è questa simmetria a impedire che i due si scostino.

  protected readonly isPurchaseInvoice = computed(() => this.printKind() === 'purchase_invoice');

  protected readonly installments = computed(() =>
    this.isPurchaseInvoice() ? (this.document()?.paymentInstallments ?? []) : [],
  );

  /** Residuo: si mostra solo se c'è davvero qualcosa da saldare. */
  protected readonly outstanding = computed(() => {
    const amount = this.isPurchaseInvoice() ? this.document()?.outstanding : undefined;
    return amount && amount.amountMinor > 0 ? amount : null;
  });

  /** Solo gli arrivi con un riferimento: uno senza numero non fa ritrovare niente. */
  protected readonly linkedReceiptRefs = computed(() => {
    if (!this.isPurchaseInvoice()) {
      return [];
    }
    return (this.document()?.linkedGoodsReceipts ?? [])
      .map((receipt) => receipt.reference)
      .filter((reference): reference is string => Boolean(reference?.trim()));
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

  // ── Trasporto e indirizzi in anteprima: documenti che viaggiano con la
  //    merce (DDT vendita e Fattura accompagnatoria), come nel PDF ─────────

  /** Righe etichetta/valore del trasporto (solo i campi compilati). */
  protected readonly transportRows = computed<readonly (readonly [string, string])[]>(() => {
    const doc = this.document();
    if (!doc || !documentTravelsWithGoods(doc.type)) {
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

  /** Intestatario: blocco proprio del DDT (sulla fattura è il cliente stesso). */
  protected readonly recipientAddressLines = computed(() => {
    const doc = this.document();
    return doc?.type === DocumentType.SalesDdt ? this.addressLines(doc.recipientAddress) : [];
  });

  protected readonly destinationAddressLines = computed(() => {
    const doc = this.document();
    if (!doc || !documentTravelsWithGoods(doc.type) || !doc.destinationAddress) {
      return [];
    }
    const destination = this.addressLines(doc.destinationAddress);
    const recipient = this.addressLines(doc.recipientAddress);
    // Destinazione coincidente con l'intestatario: si stampa una volta sola.
    return destination.join('\n') === recipient.join('\n') ? [] : destination;
  });

  // ── Avviso pre-stampa (§AVVISI): dati trasporto/indirizzi incompleti ────
  // Vale per i documenti che viaggiano con la merce (DDT vendita e Fattura
  // accompagnatoria): è alla stampa che il dato serve davvero, perché il
  // foglio sta per accompagnare la spedizione. Mai bloccante.

  protected readonly incompletePrintDialogOpen = signal(false);
  protected readonly incompletePrintMessage = TRANSPORT_INCOMPLETE_MESSAGE;
  protected readonly incompletePrintTitle = TRANSPORT_INCOMPLETE_TITLE;
  private pendingPrintAction: 'print' | 'pdf' | null = null;

  private transportIncomplete(): boolean {
    const doc = this.document();
    return doc != null && transportDataIncomplete(doc.type, doc);
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
    if (this.transportIncomplete()) {
      this.pendingPrintAction = 'print';
      this.incompletePrintDialogOpen.set(true);
      return;
    }
    globalThis.print();
  }

  protected downloadPdf(): void {
    if (this.transportIncomplete()) {
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
    this.downloadError.set(null);
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
          this.downloadError.set('Non è stato possibile generare il PDF. Riprova.');
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
