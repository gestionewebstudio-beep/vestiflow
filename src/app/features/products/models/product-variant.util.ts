// Helper puri (framework-agnostici) per il modello variante generico basato su
// `SelectedOption` (forma Shopify). Usati da mapper e wizard per generazione,
// merge e visualizzazione delle combinazioni (1-3 assi).

import type { SelectedOption } from '@core/models/product.model';

import type { OptionAxisDraft } from './product-form.model';

// Separatore non digitabile per le chiavi d'identita' (combinazione di valori).
const COMBO_SEPARATOR = '\u0000';

/** Valore selezionato per una data opzione (per nome). '' se assente. */
export function selectedOptionValue(values: readonly SelectedOption[], name: string): string {
  return values.find((option) => option.name === name)?.value ?? '';
}

/** Valori di un asse opzione per nome (lista vuota se l'asse non esiste). */
export function axisValues(axes: readonly OptionAxisDraft[], name: string): readonly string[] {
  return axes.find((axis) => axis.name === name)?.values ?? [];
}

/** Titolo leggibile della variante: valori uniti con " / " (stile Shopify). */
export function variantTitle(values: readonly SelectedOption[]): string {
  return values.map((option) => option.value).join(' / ');
}

/** Chiave stabile di una combinazione: valori in ordine d'asse. */
export function comboKey(values: readonly SelectedOption[]): string {
  return values.map((option) => option.value).join(COMBO_SEPARATOR);
}

/** Dedup preservando l'ordine d'inserimento (generazione deterministica). */
function distinctOrdered(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

/**
 * Prodotto cartesiano generico sugli assi con almeno un valore (1–3 assi), in
 * ordine stabile (primo asse esterno). Assi senza valori vengono ignorati;
 * nessun asse valorizzato -> nessuna combinazione. Ogni combinazione include
 * solo gli assi che contribuiscono (coerente con `selectedOptions` Shopify).
 */
export function cartesianOptionValues(axes: readonly OptionAxisDraft[]): SelectedOption[][] {
  const active = axes
    .map((axis) => ({ name: axis.name, values: distinctOrdered(axis.values) }))
    .filter((axis) => axis.values.length > 0);
  if (active.length === 0) {
    return [];
  }
  let combos: SelectedOption[][] = [[]];
  for (const axis of active) {
    const next: SelectedOption[][] = [];
    for (const combo of combos) {
      for (const value of axis.values) {
        next.push([...combo, { name: axis.name, value }]);
      }
    }
    combos = next;
  }
  return combos;
}
