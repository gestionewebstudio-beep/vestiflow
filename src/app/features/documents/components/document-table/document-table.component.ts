import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { DocumentRecord, LinkedPurchaseInvoiceInfo } from '@core/models/document.model';
import { formatDate } from '@core/utils/date.util';
import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';
import { storeSalePaymentMethodLabelWithNote } from '@domain/store-sales/models/store-sale-payment.util';

import {
  documentReferenceLabel,
  documentStatusDisplayLabel,
  documentStatusDisplayTone,
  documentTypeLabel,
  goodsReceiptLinkStatusLabel,
  goodsReceiptLinkStatusTone,
} from '@domain/documents/models/document-labels.util';
import {
  documentEconomicSign,
  hasDeclaredEconomicSign,
  signedDocumentMoney,
} from '@domain/documents/models/document-economic-sign.util';
import { isStoreFlowDocumentType } from '@domain/documents/models/document-operational.util';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableRowTone,
  DataTableSort,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { sezioniDiElenco } from '@shared/models/list-grouping.util';
import { totaliDiElenco } from '@shared/models/list-totals.util';

import { DOCUMENT_LIST_SORTABLE_COLUMNS } from '../../models/document-table-columns.config';
import type { DataTableSection } from '@shared/components/data-table/data-table.model';
import { goodsReceiptExternalDocLabel } from '../../utils/document-list-export.util';

/** Azioni disponibili dal menu "···" della riga (audit cliente §1: azioni dalla lista). */
export type DocumentTableActionId =
  'open' | 'duplicate' | 'delete' | 'print' | 'labels' | 'attachments';

export interface DocumentTableActionEvent {
  readonly action: DocumentTableActionId;
  readonly doc: DocumentRecord;
}

/** Cambio selezione di una riga (checkbox operazioni massive). */
export interface DocumentTableSelectionEvent {
  readonly doc: DocumentRecord;
  readonly selected: boolean;
}

/**
 * Tabella registro documenti (dumb puro). Row click verso il dettaglio; importi
 * a destra in tabular-nums; mobile come card impilate. Colonna Azioni sempre
 * presente (non fa parte delle colonne configurabili): mostra solo le voci
 * realmente disponibili per tipo/stato della riga, mai voci disabilitate.
 */
@Component({
  selector: 'app-document-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /*
    ⛔ **`DataTableRowCardDirective` NON è facoltativa**: senza, l'attributo
    `appRowCard` sul template è un attributo sconosciuto — Angular non fallisce,
    lo IGNORA, e la card progettata semplicemente non esiste. Nessun errore,
    nessun test rosso, e sotto `lg` si torna al ripiego a etichetta:valore.
  */
  imports: [
    BadgeComponent,
    RouterLink,
    DataTableComponent,
    DataTableCellDirective,
    DataTableRowCardDirective,
  ],
  templateUrl: './document-table.component.html',
  styleUrl: './document-table.component.scss',
})
export class DocumentTableComponent {
  readonly documents = input.required<readonly DocumentRecord[]>();
  readonly columns = input.required<readonly ResolvedTableColumn[]>();

  /**
   * ⭐ **Raggruppare per giornata**, deciso dalla pagina che possiede il controllo
   * «Raggruppa». Qui arriva già risolto: la tabella non conosce il menu, sa solo
   * se piegare l'elenco per giorno.
   */
  readonly groupByDay = input(false);

  /**
   * Le chiavi di ordinamento correnti, in ordine di priorità. Lo **stato sta
   * nella pagina** (`14` §H4): qui passa e basta.
   */
  readonly sort = input<readonly DataTableSort[]>([]);
  /** Azioni di gestione (duplica/elimina) mostrate solo con permesso DocumentsManage. */
  readonly canManage = input<boolean>(false);
  /**
   * Tipi documento che l'utente può gestire. Nel registro generico convivono
   * tipi di famiglie diverse: le azioni di riga si decidono su questo elenco,
   * non su un unico booleano — il componente resta dumb e riceve il dato già
   * risolto dal contenitore.
   */
  readonly manageableTypes = input<readonly string[]>([]);
  /** Selezione multipla per operazioni massive (lista Arrivi merce). */
  readonly selectable = input<boolean>(false);
  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());

  readonly rowClick = output<DocumentRecord>();

  /** Il motore propone il prossimo ordine; ad applicarlo è la pagina. */
  readonly sortChange = output<readonly DataTableSort[]>();
  readonly action = output<DocumentTableActionEvent>();
  readonly selectionChange = output<DocumentTableSelectionEvent>();
  readonly selectAllChange = output<boolean>();

  // Le due regole della checkbox di testata vivono nella primitiva comune:
  // erano identiche qui e in `sales-order-table`, e `supplier-order-table`
  // stava per essere la terza copia (`14` §4).
  private readonly visibleIds = computed(() => this.documents().map((doc) => doc.id));

  protected readonly typeLabel = documentTypeLabel;
  protected readonly formatMoney = formatMoney;

  protected referenceLabel(doc: DocumentRecord): string {
    return documentReferenceLabel(doc.type, doc.reference, doc.series);
  }

  protected counterparty(doc: DocumentRecord): string {
    return doc.supplierName ?? doc.customerName ?? '—';
  }

  /** «Cod. soggetto»: codice fornitore (acquisti) o codice cliente (vendite). */
  protected supplierCodeLabel(doc: DocumentRecord): string {
    return doc.supplierCode?.trim() || doc.customerCode?.trim() || '—';
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

  protected registrationDateLabel(doc: DocumentRecord): string {
    return doc.registrationDate ? formatDate(doc.registrationDate) : '—';
  }

  /** N. fattura fornitore (elenco Registrazioni fattura): solo il numero. */
  protected invoiceNumberLabel(doc: DocumentRecord): string {
    return doc.externalDocNumber?.trim() || '—';
  }

  /** "Ancora da saldare": importo residuo, null = tutto saldato (badge). */
  protected outstandingLabel(doc: DocumentRecord): string | null {
    const outstanding = doc.outstanding;
    if (!outstanding || outstanding.amountMinor <= 0) {
      return null;
    }
    return formatMoney(outstanding);
  }

  protected paymentMethodLabel(doc: DocumentRecord): string {
    const raw = doc.paymentMethod?.trim();
    if (!raw) {
      return '—';
    }
    // La cassa salva il codice (`cash`/`card`/`other`), i DDT lo snapshot
    // testuale della voce normativa: solo i primi vanno tradotti. «Altro»
    // mostra in coda l'eventuale descrizione libera.
    return isStoreFlowDocumentType(doc.type)
      ? storeSalePaymentMethodLabelWithNote(raw, doc.paymentMethodNote)
      : raw;
  }

  protected locationLabel(doc: DocumentRecord): string {
    return doc.locationName ?? '—';
  }

  /** "DDT 145 del 08/05/2026" quando tipo/data documento fornitore sono noti. */
  protected externalDocLabel(doc: DocumentRecord): string {
    return goodsReceiptExternalDocLabel(doc) || '—';
  }

  protected billingCauseLabel(doc: DocumentRecord): string {
    return doc.billingCause?.trim() || '—';
  }

  protected causalLabel(doc: DocumentRecord): string {
    return doc.causalText?.trim() || doc.billingCause?.trim() || '—';
  }

  protected linkStatusLabel(doc: DocumentRecord): string | null {
    return goodsReceiptLinkStatusLabel(doc);
  }

  protected linkStatusTone(doc: DocumentRecord) {
    return goodsReceiptLinkStatusTone(doc);
  }

  /** Fattura registrata collegata: la cella "Stato" diventa un link ad essa. */
  protected linkedInvoice(doc: DocumentRecord): LinkedPurchaseInvoiceInfo | null {
    return doc.linkStatus === 'linked' ? (doc.linkedPurchaseInvoice ?? null) : null;
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
  // ⛔ **Qui c'era `rowActions()`, il menu tre-puntini della riga.**
  //
  //    Sparito il 30/08/2026 per decisione del proprietario: tutte le funzioni
  //    passano dalla SELEZIONE e stanno nella barra in basso. Sei voci — Apri,
  //    Duplica, Stampa, Etichette, Allegati, Elimina — di cui una ridondante
  //    (il clic di riga apre gia' la modifica) e cinque che ora sono azioni
  //    dichiarate dall'elenco.
  //
  // ⚠️ Il difetto che ha reso urgente toglierlo: le sue regole di
  //    eliminabilita' e quelle della barra NON concordavano, e la barra
  //    offriva Elimina dove l'API risponde 409. Due strade per lo stesso
  //    comando, con due regole diverse.

  protected onAction(actionId: string, doc: DocumentRecord): void {
    this.action.emit({ action: actionId as DocumentTableActionId, doc });
  }

  protected onToggleSelect(doc: DocumentRecord, selected: boolean): void {
    this.selectionChange.emit({ doc, selected });
  }

  // ── Il motore comune (`14` parte H) ───────────────────────────────────────

  /**
   * Le colonne per il motore, con l'ordinabilità già dichiarata.
   *
   * ⛔ **Marcare qui e non nelle definizioni** tiene una fonte sola: l'insieme
   * è lo specchio della whitelist del server, e una colonna nuova nasce non
   * ordinabile finché il server non la conosce (`14` §H15).
   */
  protected readonly engineColumns = computed<readonly ResolvedTableColumn[]>(() =>
    this.columns().map((column) => ({
      ...column,
      sortable: DOCUMENT_LIST_SORTABLE_COLUMNS.has(column.id),
    })),
  );

  /**
   * ⭐ **Una sezione sola, o una per giornata** col subtotale nel piede.
   *
   * ⚠️ **Il subtotale porta il VERSO economico**, come la riga totali: una
   * fattura da 100 e una nota di credito da 50 fanno 50 nella giornata, e ci si
   * arriva col segno del tipo — non ricalcolando l'IVA.
   *
   * ⚠️ **Somma le righe caricate**, ed è corretto: l'elenco non impagina, quindi
   * ciò che ha in mano **è** il risultato del filtro.
   */
  protected readonly sections = computed<readonly DataTableSection<DocumentRecord>[]>(() => {
    const valuta = this.documents()[0]?.currency ?? DEFAULT_CURRENCY;
    const soldi = (n: number): string => formatMoney({ amountMinor: n, currencyCode: valuta });
    return sezioniDiElenco(this.documents(), this.groupByDay(), {
      idPiatto: 'documenti',
      giornoDi: (doc) => doc.documentDate,
      columns: this.columns(),
      emphasis: 'total',
      campi: {
        subtotal: {
          valore: (doc) => signedDocumentMoney(doc.type, doc.subtotal).amountMinor,
          formato: soldi,
        },
        total: {
          valore: (doc) => signedDocumentMoney(doc.type, doc.total).amountMinor,
          formato: soldi,
        },
        lineCount: { valore: (doc) => this.lineCount(doc), formato: (n) => String(n) },
      },
    });
  });

  /*
    ⭐ **La riga totali dei documenti**, e porta il VERSO economico.

    ⛔ **Non è una somma cieca**: `regole-gestionale` è esplicita — «il riepilogo
    applica la CLASSIFICAZIONE e il verso economico, non rifà il calcolo
    fiscale». Una fattura da 100 e una nota di credito da 50 fanno **50**, e ci si
    arriva col segno del tipo, non ricalcolando l'IVA della fattura.

    ⚠️ **`signedDocumentMoney` e non `documentEconomicSign`**: la seconda accetta
    solo i tipi con direzione DICHIARATA, e questo elenco ne contiene anche altri.
    Per quelli l'importo resta invariato, senza che nessuno gli attribuisca una
    direzione che non ha. È la stessa scelta già fatta per il totale della
    selezione, di cui questa riga prende il posto.

    ⭐ **Si somma `amountMinor`, si formatta UNA volta**: è la regola del denaro —
    «si arrotonda solo all'uscita, mai nei passaggi intermedi».
  */
  protected readonly totals = computed<DataTableTotals>(() => {
    const valuta = this.documents()[0]?.currency ?? DEFAULT_CURRENCY;
    const soldi = (n: number): string => formatMoney({ amountMinor: n, currencyCode: valuta });
    return totaliDiElenco(this.documents(), {
      rowId: this.rowId,
      selectedIds: this.selectedIds(),
      columns: this.columns(),
      campi: {
        subtotal: {
          valore: (doc) => signedDocumentMoney(doc.type, doc.subtotal).amountMinor,
          formato: soldi,
        },
        total: {
          valore: (doc) => signedDocumentMoney(doc.type, doc.total).amountMinor,
          formato: soldi,
        },
        lineCount: { valore: (doc) => this.lineCount(doc), formato: (n) => String(n) },
      },
    });
  });

  /*
    ⚠️ **Le colonne spente non si controllano a mano.** Legge quelle che il motore
    ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  /*
    ⭐ **Il TONO della riga, che l'elenco documenti non aveva.**

    Questo registro mescola tipi di direzione opposta — Fattura e **Nota di
    credito**, Vendita e **Reso** al banco — e li mostrava tutti uguali. Su card,
    dove il verso non si legge da una colonna incolonnata, distinguerli è la
    differenza fra scorrere e dover leggere.

    ⛔ **Non si decide niente qui**: il verso lo dà `documentEconomicSign`, unica
    autorità, e i tipi che non ne hanno uno DICHIARATO restano `null` — non
    `positive`. `regole-stile-ui` è esplicita: «un elenco che non distingue i
    versi restituisce `null`, la striscia colorata su ogni card sarebbe rumore».
    Trasferimenti, rettifiche e inventari non hanno una direzione economica, e
    attribuirgliene una sarebbe una decisione che nessuno ha preso.
  */
  protected readonly rowTone = (doc: DocumentRecord): DataTableRowTone | null => {
    if (!hasDeclaredEconomicSign(doc.type)) {
      return null;
    }
    return documentEconomicSign(doc.type) < 0 ? 'negative' : 'positive';
  };

  protected visibile(columnId: string): boolean {
    return this.columns().some((column) => column.id === columnId);
  }

  protected readonly rowId = (doc: DocumentRecord): string => doc.id;

  /**
   * ⛔ **Una FRECCIA, non il metodo `rowLabel` passato per nome.**
   *
   * Il motore riceve la callback come valore e la chiama così com'è
   * (`rowLabel()(row)`): un metodo di classe passato per nome arriva **senza
   * `this`**, e la prima riga cliccabile che si renderizza lancia
   * «Cannot read properties of undefined (reading 'referenceLabel')» —
   * l'elenco documenti intero, per tutti e otto i profili.
   *
   * ⚠️ **Nessun test se n'era accorto**, e non è un caso: i test di questo
   * elenco rendono zero righe, dove la callback non viene mai invocata. È la
   * stessa lezione di `14` §H14, un gradino più in basso — lì la CSS perdeva
   * l'aggancio in silenzio, qui la callback perde `this`.
   *
   * L'Ordine cliente aveva già coniato `rowLabelFor` per questa ragione: le
   * altre quattro callback erano già frecce, questa era l'unica rimasta metodo.
   */
  protected readonly rowLabelFor = (doc: DocumentRecord): string => this.rowLabel(doc);

  protected readonly selectionLabel = (doc: DocumentRecord): string =>
    `Seleziona documento ${this.referenceLabel(doc)}`;

  /**
   * Il testo delle celle che sono testo — diciotto colonne su ventuno.
   *
   * ⚠️ I trattini non sono decorazione: una cella vuota in una tabella densa si
   * legge come un errore di caricamento, non come «non c'è».
   */
  protected readonly cellText = (doc: DocumentRecord, columnId: string): string => {
    switch (columnId) {
      case 'documentDate':
        return this.dateLabel(doc);
      case 'type':
        return this.typeLabel(doc.type);
      case 'reference':
        return this.referenceLabel(doc);
      case 'counterparty':
        return this.counterparty(doc);
      case 'supplierCode':
        return this.supplierCodeLabel(doc);
      case 'billingCause':
        return this.billingCauseLabel(doc);
      case 'causal':
        return this.causalLabel(doc);
      case 'notes':
        return this.notesLabel(doc);
      case 'location':
        return this.locationLabel(doc);
      case 'externalDocNumber':
        return this.externalDocLabel(doc);
      case 'registrationDate':
        return this.registrationDateLabel(doc);
      case 'invoiceNumber':
        return this.invoiceNumberLabel(doc);
      case 'paymentMethod':
        return this.paymentMethodLabel(doc);
      case 'lineCount':
        return String(this.lineCount(doc));
      case 'subtotal':
        return formatMoney(doc.subtotal);
      case 'total':
        return formatMoney(doc.total);
      case 'outstanding':
        return this.outstandingLabel(doc) ?? '';
      default:
        return '';
    }
  };
}
