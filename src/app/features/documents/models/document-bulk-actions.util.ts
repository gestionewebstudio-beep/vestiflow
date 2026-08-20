import { DocumentType } from '@core/models/document.model';
import type { DocumentType as DocumentTypeValue } from '@core/models/document.model';

/**
 * Tipi documento che **non si eliminano dal registro**, mai — nemmeno con il
 * permesso di gestione.
 *
 * ⛔ È lo specchio di `FLOW_ONLY_DOCUMENT_TYPES` in
 * `api/src/documents/document-defaults.ts`: quei tipi nascono già confermati
 * con i propri movimenti in transazione, e i cinque percorsi generici li
 * rifiutano. Mostrarne il comando produrrebbe **un pulsante che risponde 409** —
 * il difetto che `11` C 0 nomina per esteso: «un elenco con il comando Elimina
 * sarebbe un comando che l'API rifiuta».
 *
 * ⚠️ **Le due liste devono restare uguali, e nessun compilatore lo verifica.**
 * Se un tipo entra o esce da `FLOW_ONLY_DOCUMENT_TYPES` lato API, va toccata
 * anche questa: il sintomo di una divergenza è un pulsante che fallisce a
 * lavoro fatto, o un comando che manca senza motivo.
 */
export const DOCUMENT_TYPES_WITHOUT_BULK_DELETE: readonly DocumentTypeValue[] = [
  DocumentType.StoreSale,
  DocumentType.StoreReturn,
];

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
