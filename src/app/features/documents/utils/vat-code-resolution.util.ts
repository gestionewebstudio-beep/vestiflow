import type { VatCode } from '@core/models/vat-code.model';

/**
 * Risoluzione Codice IVA riga condivisa tra i form documento (§Piano IVA
 * fase 3): funzione pura, non legata alla forma del FormGroup di un
 * componente specifico. Ogni form resta responsabile di leggere i propri
 * controlli e di scrivere il risultato — solo la logica di precedenza tra
 * candidati (primo id valido, attivo e utilizzabile nello scope richiesto)
 * è condivisa, per evitare di duplicarla tra Arrivo merce e documenti
 * generici di vendita.
 */

/** Primo Codice IVA valido tra i candidati, nell'ordine di precedenza fornito. */
export function pickVatCodeId(
  candidateIds: readonly (string | null | undefined)[],
  vatCodeById: ReadonlyMap<string, VatCode>,
  isUsable: (vatCode: VatCode) => boolean,
): string | null {
  for (const candidateId of candidateIds) {
    if (!candidateId) {
      continue;
    }
    const vatCode = vatCodeById.get(candidateId);
    if (vatCode?.isActive && isUsable(vatCode)) {
      return vatCode.id;
    }
  }
  return null;
}

/** Indice id → Codice IVA, per lookup O(1) nei form documento. */
export function toVatCodeById(vatCodes: readonly VatCode[]): ReadonlyMap<string, VatCode> {
  return new Map(vatCodes.map((vatCode) => [vatCode.id, vatCode]));
}
