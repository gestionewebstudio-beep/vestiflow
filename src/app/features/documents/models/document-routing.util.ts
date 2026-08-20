import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type {
  DocumentStatus as DocumentStatusValue,
  DocumentType as DocumentTypeValue,
} from '@core/models/document.model';
import type { User } from '@core/models/user.model';
import {
  canManageDocumentType,
  canViewDocumentType,
} from '@core/permissions/document-permission.util';
import { canOpenRetailRegister } from '@core/permissions/tenant-permissions.util';

import { isGoodsReceiptDocumentType } from './document-goods-receipt.util';
import {
  isAdjustmentDocumentType,
  isManualUnloadDocumentType,
} from './document-stock-operation.util';
import {
  isSalesFormDocumentType,
  type SalesFormDocumentType,
} from '@domain/documents/models/document-sales.util';
import { isTransferDocumentType } from './document-transfer.util';
import {
  STORE_SALE_ROOT_PATH,
  storeSaleEditPath,
  storeSaleModeOfDocumentType,
} from '@domain/store-sales/models/store-sale-routing.util';

/**
 * Segmento di indirizzo della maschera vendita, per tipo. **Fonte unica**: da
 * qui nascono la rotta di creazione (`<segmento>/new`), quella di modifica
 * (`<segmento>/:id/edit`), il percorso di duplicazione e i link dell'elenco.
 *
 * È una mappa esaustiva e non un elenco, apposta: aggiungere un tipo alla
 * maschera vendita senza dargli un indirizzo non compila. Un elenco avrebbe
 * lasciato passare il tipo senza rotta, e il sintomo sarebbe arrivato molto
 * dopo — una voce di menu che porta a una pagina che non esiste.
 */
export const SALES_FORM_ROUTE_SEGMENT: Readonly<Record<SalesFormDocumentType, string>> = {
  [DocumentType.Proforma]: 'proforma',
  [DocumentType.InvoiceDraft]: 'fattura',
  [DocumentType.InvoiceAccompanying]: 'fattura-accompagnatoria',
  [DocumentType.CreditNote]: 'nota-di-credito',
};

/** Il segmento del tipo, o `null` se quel tipo non usa la maschera vendita. */
export function salesFormRouteSegment(type: DocumentTypeValue): string | null {
  return isSalesFormDocumentType(type)
    ? SALES_FORM_ROUTE_SEGMENT[type as SalesFormDocumentType]
    : null;
}

/**
 * Percorso di modifica di un documento per tipo (usato da lista, dettaglio e
 * dopo la duplicazione). Centralizza il routing altrimenti duplicato tra
 * `document-list.component.ts` e `document-detail.component.ts`.
 *
 * ⚠️ **Non chiamarla direttamente per decidere dove porta una riga**: quella
 * risposta la dà `documentRowPath`, che sa anche quali tipi una maschera non ce
 * l'hanno. Qui si risponde solo alla domanda «dove si modifica questo tipo».
 */
export function documentEditPath(doc: {
  readonly id: string;
  readonly type: DocumentTypeValue;
}): string {
  if (doc.type === DocumentType.Quote) {
    return `/app/documents/quote/${doc.id}/edit`;
  }
  // I due ordini vivono FUORI da /app/documents, e sono l'unico caso in cui la
  // maschera non sta nel modulo documenti: senza queste due righe cadrebbero
  // nel ramo finale, che è la maschera dell'Arrivo merce.
  if (doc.type === DocumentType.CustomerOrder) {
    return `/app/sales/${doc.id}/edit`;
  }
  if (doc.type === DocumentType.SupplierOrder) {
    return `/app/orders/${doc.id}/edit`;
  }
  // DDT vendita: maschera dell'Ordine cliente in modalità sales-ddt (prompt DDT).
  if (doc.type === DocumentType.SalesDdt) {
    return `/app/documents/sales-ddt/${doc.id}/edit`;
  }
  // Un indirizzo per tipo: il form deve conoscere il tipo PRIMA di leggere il
  // documento, altrimenti fino alla risposta si comporta da proforma (`07-…§18`).
  const salesSegment = salesFormRouteSegment(doc.type);
  if (salesSegment) {
    return `/app/documents/${salesSegment}/${doc.id}/edit`;
  }
  if (isTransferDocumentType(doc.type)) {
    return `/app/documents/transfer/${doc.id}/edit`;
  }
  if (isManualUnloadDocumentType(doc.type)) {
    return `/app/documents/manual-unload/${doc.id}/edit`;
  }
  if (isAdjustmentDocumentType(doc.type)) {
    return `/app/documents/adjustment/${doc.id}/edit`;
  }
  if (doc.type === DocumentType.SupplierInvoice) {
    return `/app/documents/registrazione-fattura/${doc.id}/edit`;
  }
  // Vendita e Reso al banco: un indirizzo per tipo, come la maschera vendita.
  const bancoMode = storeSaleModeOfDocumentType(doc.type);
  if (bancoMode) {
    return storeSaleEditPath(bancoMode, doc.id);
  }
  // Ramo finale: la famiglia carico (arrivo merce, carico manuale, iniziale),
  // che condivide UNA maschera montata su `/app/documents/:id/edit`.
  return `/app/documents/${doc.id}/edit`;
}

/**
 * Che cosa apre il clic su una riga di elenco documentale (`14` §2).
 *
 * ⛔ **Record ESAUSTIVO per tipo, non un elenco né una catena di `if`**: è la
 * stessa forma di `SALES_FORM_ROUTE_SEGMENT` e per la stessa ragione —
 * aggiungere un tipo documento senza dichiarare dove porta la sua riga **non
 * compila**. Una catena di `if` con un `default` avrebbe lasciato passare il
 * tipo nuovo, e il sintomo sarebbe arrivato molto dopo: una riga che apre la
 * maschera di un altro documento.
 *
 * `'form'` = ha una maschera operativa e la riga ci porta.
 * `'detail'` = non ne ha una (§2.1: non si inventa una falsa maschera
 * editabile solo per uniformità).
 */
export const DOCUMENT_ROW_OPENS: Readonly<Record<DocumentTypeValue, 'form' | 'detail'>> = {
  // Famiglia carico: un'unica maschera per i tre.
  [DocumentType.GoodsReceipt]: 'form',
  [DocumentType.ManualLoad]: 'form',
  [DocumentType.InitialLoad]: 'form',
  [DocumentType.SupplierInvoice]: 'form',
  // Operazioni di magazzino: ognuna con la sua maschera.
  [DocumentType.Transfer]: 'form',
  [DocumentType.ManualUnload]: 'form',
  [DocumentType.Adjustment]: 'form',
  // Vendita: preventivo, DDT e i tre della famiglia Fattura.
  [DocumentType.Quote]: 'form',
  [DocumentType.SalesDdt]: 'form',
  [DocumentType.Proforma]: 'form',
  [DocumentType.InvoiceDraft]: 'form',
  [DocumentType.InvoiceAccompanying]: 'form',
  [DocumentType.CreditNote]: 'form',
  // Banco: un indirizzo per tipo (`11` A2).
  [DocumentType.StoreSale]: 'form',
  [DocumentType.StoreReturn]: 'form',
  // I due ordini: la maschera c'è, ma vive fuori dal modulo documenti.
  [DocumentType.CustomerOrder]: 'form',
  [DocumentType.SupplierOrder]: 'form',
  // ⛔ L'inventario fisico NON ha una maschera documentale: il conteggio ha un
  // flusso proprio in `/app/inventory/counts`. È il caso del §2.1 — inventarne
  // una qui vorrebbe dire costruire una porta che non porta da nessuna parte.
  [DocumentType.Inventory]: 'detail',
};

/**
 * Il **Dettaglio** del documento: la vista di CONSULTAZIONE, in sola lettura
 * (`14` §6).
 *
 * ⛔ Qui c'era «l'ANTEPRIMA … non è il dettaglio», ed è rovesciato: il
 * proprietario ha deciso il 20/08/2026 che il nome VestiFlow della
 * consultazione è **Dettaglio** — la parola che l'operatore legge già nei
 * titoli di pagina e in guida. «Anteprima» esce dal vocabolario: un secondo
 * nome per la stessa cosa insegna un termine che poi non si ritrova da
 * nessun'altra parte.
 *
 * ⚠️ **Non è la stampa.** `documents/:id/print` è il foglio di stampa, che è
 * una terza funzione: che un documento si stampi non dice niente su come lo si
 * consulta.
 *
 * Per i tipi che hanno una pagina dedicata è quella, per gli altri il dettaglio
 * generico.
 */
export function documentDetailPath(doc: {
  readonly id: string;
  readonly type: DocumentTypeValue;
}): string {
  switch (doc.type) {
    case DocumentType.Quote:
      return `/app/documents/quote/${doc.id}`;
    case DocumentType.Proforma:
      return `/app/documents/proforma/${doc.id}`;
    case DocumentType.SalesDdt:
      return `/app/documents/sales-ddt/${doc.id}`;
    // I tre tipi della famiglia si aprono sullo STESSO elenco: il progressivo è
    // uno solo, e un dettaglio su una pagina propria suggerirebbe il contrario.
    case DocumentType.InvoiceDraft:
    case DocumentType.InvoiceAccompanying:
    case DocumentType.CreditNote:
      return `/app/documents/fattura/${doc.id}`;
    case DocumentType.ManualUnload:
      return `/app/documents/manual-unload/${doc.id}`;
    case DocumentType.StoreSale:
    case DocumentType.StoreReturn:
      return `${STORE_SALE_ROOT_PATH}/${doc.id}`;
    default:
      return `/app/documents/${doc.id}`;
  }
}

/**
 * Se **questo utente** può aprire la maschera di **questo tipo**.
 *
 * ⛔ **È lo specchio dei guard delle rotte di modifica**, e senza di esso la
 * regola «la riga apre la modifica» diventa una porta finta: le rotte di
 * modifica chiedono `familyManage`, quelle di Dettaglio `familyView`, e un
 * operatore in sola consultazione — che l'elenco lo vede eccome — verrebbe
 * rimbalzato dal guard a ogni clic.
 *
 * ⚠️ Il difetto **esisteva già** prima che la regola diventasse comune: il
 * Preventivo aveva `rowOpensForm: true` e la sua rotta chiede `familyManage`.
 * Riguardava una lista sola, e generalizzare la regola lo avrebbe portato su
 * tutte.
 *
 * I tre casi non sono uguali, perché non lo sono i guard:
 *
 * | Tipo                          | Chiede                                        |
 * | ----------------------------- | --------------------------------------------- |
 * | Vendita e Reso al banco       | `retail.register`, come `retailSalesRegisterGuard` |
 * | Ordine cliente                | la sola VISTA: la rotta è view-gated e il form si apre bloccato |
 * | tutti gli altri               | `familyManage` della loro famiglia            |
 */
export function canOpenDocumentForm(
  user: User | null | undefined,
  type: DocumentTypeValue,
): boolean {
  if (storeSaleModeOfDocumentType(type)) {
    return canOpenRetailRegister(user);
  }
  // ⚠️ L'Ordine cliente ha già fatto questa migrazione: la sua rotta `:id/edit`
  // è gated in VISTA e il form si apre bloccato, con lo sblocco gated dentro —
  // «sostituisce la vecchia schermata Dettaglio». È la direzione giusta anche
  // per gli altri tipi, ed è registrata in `14` §7.
  if (type === DocumentType.CustomerOrder) {
    return canViewDocumentType(user, type);
  }
  return canManageDocumentType(user, type);
}

/**
 * ⛔ **Dove porta il clic su una riga di documento. Unica risposta, per tutti
 * gli elenchi** (`14` §2 e §14).
 *
 * Qui c'erano sei rami dentro `openDocument` della lista, e due di essi
 * finivano ancora sul Dettaglio: la stessa applicazione apriva un preventivo
 * in modifica e una fattura in sola lettura, e l'operatore doveva ricordarsi
 * quale. Ora la differenza sta in un solo posto, dichiarata per tipo.
 *
 * ⚠️ **Un documento ANNULLATO apre il Dettaglio**, qualunque sia il tipo: non
 * c'è nulla da modificare. Era già la scelta del codice per le registrazioni
 * fattura e per i profili «in stile Arrivi merce» — qui diventa la regola, e
 * smette di dipendere dal profilo di elenco da cui si è passati.
 */
export function documentRowPath(
  doc: {
    readonly id: string;
    readonly type: DocumentTypeValue;
    readonly status: DocumentStatusValue;
  },
  user: User | null | undefined,
): string {
  if (doc.status === DocumentStatus.Cancelled) {
    return documentDetailPath(doc);
  }
  // ⛔ L'utente è un parametro OBBLIGATORIO, non un'opzione con un default: un
  // default «può» manderebbe in silenzio chi non può contro il guard, ed è
  // proprio il difetto che questa funzione esiste per non avere.
  if (!canOpenDocumentForm(user, doc.type)) {
    return documentDetailPath(doc);
  }
  return DOCUMENT_ROW_OPENS[doc.type] === 'form' ? documentEditPath(doc) : documentDetailPath(doc);
}

/**
 * Percorso di apertura canonico di un documento fuori dalle sue liste (ricerca
 * globale, link trasversali).
 *
 * ⛔ **Delega a `documentRowPath`, e non è un dettaglio**: se la ricerca globale
 * e il clic di riga rispondessero in modo diverso, lo stesso documento avrebbe
 * due aperture — che è il difetto che `14` §13.3 vieta esplicitamente.
 */
export function documentOpenPath(
  doc: {
    readonly id: string;
    readonly type: DocumentTypeValue;
    readonly status: DocumentStatusValue;
  },
  user: User | null | undefined,
): string {
  return documentRowPath(doc, user);
}

/**
 * Rotta del form «nuovo» per la duplicazione «apre il form precompilato»
 * (Fase 3, no bozze): duplicare naviga qui con `?duplicateFrom=<id>` e il form
 * copia il contenuto dell'originale in un documento nuovo. Ritorna `null` per i
 * tipi il cui form non supporta ancora il prefill di duplicazione: quelli
 * restano sul percorso legacy (crea copia e naviga alla modifica).
 */
export function documentDuplicateFormRoute(type: DocumentTypeValue): string | null {
  // Famiglia carico (arrivo merce, carico manuale, carico iniziale): tutti
  // gestiti dalla stessa maschera, che imposta il tipo dalla copia.
  if (isGoodsReceiptDocumentType(type)) {
    return '/app/documents/goods-receipt/new';
  }
  // Maschera vendita: il percorso viene dalla mappa dei segmenti, così un tipo
  // nuovo lo eredita senza che nessuno debba ricordarsi di aggiungerlo qui.
  const salesSegment = salesFormRouteSegment(type);
  if (salesSegment) {
    return `/app/documents/${salesSegment}/new`;
  }
  switch (type) {
    case DocumentType.SalesDdt:
      return '/app/documents/sales-ddt/new';
    case DocumentType.Quote:
      return '/app/documents/quote/new';
    case DocumentType.ManualUnload:
      return '/app/documents/manual-unload/new';
    case DocumentType.Transfer:
      return '/app/documents/transfer/new';
    case DocumentType.Adjustment:
      return '/app/documents/adjustment/new';
    case DocumentType.SupplierInvoice:
      return '/app/documents/registrazione-fattura/new';
    default:
      return null;
  }
}

/**
 * Il tipo dichiarato dai `data` della rotta, o un errore se manca.
 *
 * Non è difensivismo: la maschera vendita serve quattro tipi con regole fiscali
 * diverse, e senza il tipo dovrebbe indovinarlo. Indovinava — ricadeva su
 * Proforma — ed è il difetto che le rotte per tipo hanno chiuso (`07-…§18`).
 * Qui l'assenza smette di essere un caso da gestire e diventa quello che è:
 * una rotta scritta male, che deve rompersi in modo visibile.
 */
export function requireSalesDocumentType(data: Record<string, unknown>): SalesFormDocumentType {
  const type = data['salesDocumentType'];
  if (typeof type === 'string' && isSalesFormDocumentType(type as DocumentTypeValue)) {
    return type as SalesFormDocumentType;
  }
  throw new Error(
    'Rotta senza `salesDocumentType`: la maschera vendita non può dedurre il tipo del ' +
      'documento. Aggiungilo ai `data` della rotta (vedi documents.routes.ts).',
  );
}
