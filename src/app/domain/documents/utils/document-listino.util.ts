import type { Money } from '@core/models/money.model';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { activeListinoSlots } from '@domain/products/models/product-listino.model';
import type { TenantFeatureSettings } from '@domain/tenant/models/tenant-feature-settings.model';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

/**
 * Listino scelto in testata documento (§B4). `article` è il prezzo di vendita
 * dell'articolo, cioè il comportamento di sempre: è il valore di partenza e non
 * è un listino aggiuntivo, per questo non ha una posizione.
 */
export type DocumentListinoChoice = 'article' | 1 | 2 | 3;

/** Valore della tendina quando è selezionato il prezzo articolo. */
export const ARTICLE_LISTINO_VALUE = 'article';

/**
 * Opzioni della tendina: il prezzo articolo più i soli listini che il tenant ha
 * attivato. Un listino spento non compare — per quel tenant non esiste.
 */
export function listinoSelectOptions(
  settings: TenantFeatureSettings | null,
): readonly SelectMenuOption[] {
  return [
    { value: ARTICLE_LISTINO_VALUE, label: 'Prezzo articolo' },
    ...activeListinoSlots(settings).map((slot) => ({
      value: String(slot.position),
      label: slot.label,
    })),
  ];
}

/** Testo della tendina → scelta tipizzata. Valore sconosciuto = prezzo articolo. */
export function parseListinoChoice(value: string | null | undefined): DocumentListinoChoice {
  if (value === '1' || value === '2' || value === '3') {
    return Number(value) as 1 | 2 | 3;
  }
  return 'article';
}

/**
 * Prezzo unitario che la riga deve prendere per la scelta corrente.
 *
 * `null` significa **una cosa sola**: l'articolo non ha un valore per il
 * listino scelto. Non è un errore di lettura e non si ripiega sul prezzo
 * articolo — chi chiama mette la riga a zero e lo segnala, perché un prezzo che
 * nessuno ha deciso non deve finire in un documento senza che si veda.
 */
export function listinoUnitPrice(
  variant: Pick<VariantSummary, 'sellingPrice' | 'listinoPrices'>,
  choice: DocumentListinoChoice,
): Money | null {
  if (choice === 'article') {
    return variant.sellingPrice;
  }
  return variant.listinoPrices?.[choice] ?? null;
}
