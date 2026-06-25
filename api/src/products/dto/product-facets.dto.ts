/** Valori distinti per filtri lista prodotti (derivati dal catalogo tenant). */
export interface ProductFacetsDto {
  readonly categories: readonly string[];
  readonly brands: readonly string[];
  readonly seasons: readonly string[];
}
