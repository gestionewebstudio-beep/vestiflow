import type { EntityId } from '@core/models/common.model';
import type { ArticoloTrovato } from '@domain/products/models/articolo-trovato.model';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

/**
 * ⭐ **La situazione di un articolo: una griglia TAGLIA × SEDE.**
 *
 * È la risposta alla domanda del commesso — «ce l'ho, e dove?» — nella forma in
 * cui la fa: prima la taglia, poi il posto.
 *
 * ⚠️ **Le colonne sono le sedi operative**, che in un tenant sono due o tre: una
 * griglia larga quanto le sedi sta sul telefono, una larga quanto le varianti no.
 */
export interface SedeSituazione {
  readonly locationId: EntityId;
  readonly locationName: string;
}

export interface RigaSituazione {
  readonly variantId: EntityId;
  /** «M», «M · Rosso»: come si chiama la taglia per chi la cerca. */
  readonly etichetta: string;
  readonly sku: string;
  /** Disponibile per sede, nell'ordine di `sedi`. `null` = mai movimentata. */
  readonly perSede: readonly (number | null)[];
  /** Somma delle sedi; `null` se nessuna sede ha un numero. */
  readonly totale: number | null;
}

export interface SituazioneArticolo {
  readonly sedi: readonly SedeSituazione[];
  readonly righe: readonly RigaSituazione[];
}

/**
 * Compone la griglia dalle varianti lette **una sede alla volta**.
 *
 * ⚠️ **`perSede` ha sempre la lunghezza di `sedi`**, anche dove il dato manca:
 * una riga più corta disallineerebbe le colonne senza che niente lo dica.
 *
 * ⛔ **L'ordine delle righe è quello dell'articolo**, non quello della prima
 * sede che risponde: le sedi arrivano in parallelo, e ordinare per risposta
 * darebbe una griglia diversa a ogni ricerca.
 */
export function componiSituazione(
  articolo: ArticoloTrovato,
  sedi: readonly SedeSituazione[],
  perSede: readonly (readonly VariantSummary[])[],
): SituazioneArticolo {
  const indicePerSede = perSede.map(
    (varianti) => new Map(varianti.map((v) => [v.variantId, v] as const)),
  );

  const righe = articolo.varianti.map((variante): RigaSituazione => {
    const valori = indicePerSede.map((indice) => {
      const trovata = indice.get(variante.variantId);
      return trovata?.stockAvailable ?? null;
    });
    let totale: number | null = null;
    for (const valore of valori) {
      if (valore !== null) {
        totale = (totale ?? 0) + valore;
      }
    }
    return {
      variantId: variante.variantId,
      etichetta: variante.variantLabel || variante.sku,
      sku: variante.sku,
      perSede: valori,
      totale,
    };
  });

  return { sedi, righe };
}
