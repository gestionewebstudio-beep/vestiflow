import { DocumentStatus } from '@core/models/document.model';
import type { DocumentType as DocumentTypeValue } from '@core/models/document.model';
import { DocumentType } from '@core/models/document.model';
import { isStoreFlowDocumentType } from '@domain/documents/models/document-operational.util';
import { isQuoteDocumentType } from '@domain/documents/models/document-sales.util';
import { isGoodsReceiptDocumentType } from '@domain/documents/utils/document-goods-receipt.util';
import { isManualUnloadDocumentType } from '@domain/documents/utils/document-stock-operation.util';

/**
 * Tipi documento che **non si eliminano dal registro**, mai — nemmeno con il
 * permesso di gestione.
 *
 * ⭐ **Oggi è VUOTO, ed è una notizia** (22/08/2026). Conteneva Vendita e Reso
 * al banco, e la ragione dichiarata era una sola: «l'API risponde 409». Col
 * passo 14 l'API non risponde più 409 — i due tipi si eliminano, e
 * l'eliminazione neutralizza i propri movimenti restituendo la merce (`11` A2).
 * Tenerli qui avrebbe nascosto un comando che ora funziona.
 *
 * ⛔ **La costante resta**, e non è zelo: è lo specchio di
 * `FLOW_ONLY_DOCUMENT_TYPES` lato API per i tipi che un giorno nascessero senza
 * un percorso di eliminazione. Il giorno che ne arriva uno, si scrive qui — e
 * la prova qui accanto fa arrossare chi cambia una lista e non l'altra.
 */
export const DOCUMENT_TYPES_WITHOUT_BULK_DELETE: readonly DocumentTypeValue[] = [];

/** Il minimo che serve per decidere: tipo, stato, e l'aggancio alla fattura. */
export interface DeletableDocument {
  readonly type: DocumentTypeValue;
  readonly status: DocumentStatus;
  readonly linkStatus?: string;
}

/**
 * ⭐ **Se un documento si può eliminare — UNA regola, specchio dell'API.**
 *
 * ⛔ **Ce n'erano DUE, e non concordavano** (misurato il 30/08/2026). Il menu
 * di riga guardava tipo e stato; la barra di selezione chiamava
 * `canBulkDeleteDocuments`, che con la lista di esclusione vuota rispondeva
 * **sempre di sì**. Conseguenza: su una fattura confermata la barra offriva
 * Elimina e l'API rispondeva `409` — dopo aver fatto premere l'operatore.
 *
 * Le condizioni qui sotto sono quelle di `documents.service.ts` §delete, nello
 * stesso ordine:
 *
 * ```text
 * bozza o annullato               sempre eliminabile
 * arrivo merce / carico           anche da confermato: l'API toglie i movimenti
 * registrazione fattura fornitore anche da confermata
 * vendita manuale                 in qualunque stato (le giacenze NON tornano)
 * preventivo                      in qualunque stato: non muove magazzino
 * vendita / reso al banco         l'API storna i movimenti e restituisce la merce
 * ── e in ogni caso ──
 * collegato a una fattura         ⛔ mai: va prima scollegato
 * ```
 *
 * ⚠️ **`linkStatus` si controlla per TUTTI**, non solo per gli arrivi merce:
 * l'API lo fa dopo lo `switch`, quindi qualunque documento collegato viene
 * rifiutato. La vecchia regola del menu lo verificava solo sulla famiglia
 * carico.
 */
export function canDeleteDocument(doc: DeletableDocument): boolean {
  if (DOCUMENT_TYPES_WITHOUT_BULK_DELETE.includes(doc.type)) {
    return false;
  }
  if (doc.linkStatus === 'linked') {
    return false;
  }
  if (doc.status === DocumentStatus.Draft || doc.status === DocumentStatus.Cancelled) {
    return true;
  }
  return (
    isGoodsReceiptDocumentType(doc.type) ||
    doc.type === DocumentType.SupplierInvoice ||
    isManualUnloadDocumentType(doc.type) ||
    isQuoteDocumentType(doc.type) ||
    isStoreFlowDocumentType(doc.type)
  );
}

/**
 * Se la selezione corrente può essere eliminata in blocco (`14` §5.2: solo le
 * azioni che hanno davvero senso in massa).
 *
 * ⚠️ Basta **un solo** documento non eliminabile perché il comando si spenga:
 * una eliminazione parziale lascerebbe l'operatore a indovinare quali righe
 * sono state tolte e quali no.
 */
export function canBulkDeleteDocuments(docs: readonly DeletableDocument[]): boolean {
  return docs.length > 0 && docs.every(canDeleteDocument);
}

/**
 * Perché la selezione non si elimina, da mostrare sull'azione spenta.
 *
 * ⭐ **Nomina la causa, non il divieto.** «Contiene documenti che non si
 * eliminano» non dice quale né perché: con venti righe selezionate l'operatore
 * resterebbe a toglierne una per volta finché il comando non si accende.
 */
export function bulkDeleteBlockReason(docs: readonly DeletableDocument[]): string | null {
  if (docs.length === 0) {
    return 'Seleziona almeno un documento.';
  }
  const bloccati = docs.filter((doc) => !canDeleteDocument(doc));
  if (bloccati.length === 0) {
    return null;
  }
  if (bloccati.some((doc) => doc.linkStatus === 'linked')) {
    return 'La selezione contiene un arrivo merce collegato a una fattura registrata: scollegalo prima di eliminarlo.';
  }
  return 'La selezione contiene documenti confermati che non si eliminano.';
}
