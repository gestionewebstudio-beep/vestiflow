import type { DocumentType as DocumentTypeValue } from '@core/models/document.model';

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

/**
 * Se la selezione corrente può essere eliminata in blocco (`14` §5.2: solo le
 * azioni che hanno davvero senso in massa).
 *
 * ⚠️ Basta **un solo** documento non eliminabile perché il comando sparisca: una
 * eliminazione parziale lascerebbe l'operatore a indovinare quali righe sono
 * state tolte e quali no.
 */
export function canBulkDeleteDocuments(
  docs: readonly { readonly type: DocumentTypeValue }[],
): boolean {
  return (
    docs.length > 0 && docs.every((doc) => !DOCUMENT_TYPES_WITHOUT_BULK_DELETE.includes(doc.type))
  );
}
