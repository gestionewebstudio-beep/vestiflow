import { ProductStatus, VariantLifecycleStatus, type Prisma } from '@prisma/client';

/**
 * Ciclo di vita LOCALE di prodotto e variante (docs/24 §3, §4) — l'unico posto
 * dell'API in cui si decide che cosa significano «Attiva», «Non attiva» e «Nel
 * cestino». Chi filtra o classifica importa da qui; nessun service ripete la
 * regola nel proprio `where`.
 *
 * Tre assi, da non confondere (§3.7):
 *
 *   stato prodotto   `Product.status`              `archived`  = Non attivo
 *   stato variante   `ProductVariant.lifecycleStatus` `inactive` = Non attiva
 *   cestino          `deletedAt != null`           su entrambi = Nel cestino
 *
 * ⛔ Il cestino NON è uno stato: è un asse a parte. Un prodotto `active` può
 *    stare nel cestino, e uno `archived` può non starci.
 */

/** Fuori dal cestino. Vale per prodotto E variante: la colonna è la stessa. */
export const NOT_IN_TRASH = { deletedAt: null } as const;

/** Solo nel cestino — la vista amministrativa Cestino (§6). */
export const ONLY_IN_TRASH = { deletedAt: { not: null } } as const;

/**
 * Prodotto SELEZIONABILE in un nuovo documento commerciale (§3.4): in uso e
 * fuori dal cestino. `draft` e `archived` non si selezionano.
 */
export const PRODUCT_COMMERCIALLY_SELECTABLE = {
  ...NOT_IN_TRASH,
  status: ProductStatus.active,
} as const satisfies Prisma.ProductWhereInput;

/**
 * Variante SELEZIONABILE in un nuovo documento commerciale (§3.4): attiva, fuori
 * dal cestino, e con il prodotto a sua volta selezionabile. È il predicato di
 * riepiloghi varianti e ricerca per codice; NON quello di giacenze, movimenti
 * o report, che sono contesti storici e non filtrano sullo stato corrente
 * (§6.1, guardia `check:historical-catalog-state`).
 */
export const VARIANT_COMMERCIALLY_SELECTABLE = {
  ...NOT_IN_TRASH,
  lifecycleStatus: VariantLifecycleStatus.active,
  product: PRODUCT_COMMERCIALLY_SELECTABLE,
} as const satisfies Prisma.ProductVariantWhereInput;

/** `deletedAt` valorizzato = «Nel cestino». Stessa colonna su prodotto e variante. */
export function isInTrash(row: { readonly deletedAt: Date | null }): boolean {
  return row.deletedAt !== null;
}

/** «Non attivo» per il prodotto: `archived`. `draft` non è «non attivo», è «bozza». */
export function isProductInactive(row: { readonly status: ProductStatus }): boolean {
  return row.status === ProductStatus.archived;
}

/** «Non attiva» per la variante. */
export function isVariantInactive(row: {
  readonly lifecycleStatus: VariantLifecycleStatus;
}): boolean {
  return row.lifecycleStatus === VariantLifecycleStatus.inactive;
}
