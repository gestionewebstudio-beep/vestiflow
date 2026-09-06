import { ProductStatus } from '@core/models/product.model';
import { VariantLifecycleStatus } from '@core/models/product-variant.model';
import type { BadgeTone } from '@shared/components/badge/badge.component';

/**
 * Ciclo di vita LOCALE di prodotto e variante (docs/24 §3, §4) — l'unico posto
 * del client in cui si decide che cosa significano «Non attivo», «Non attiva»
 * e «Nel cestino», e come si mostrano. I componenti importano da qui: nessuno
 * confronta `deletedAt` o `lifecycleStatus` per conto proprio.
 *
 * Tre assi, da non confondere (§3.7): stato prodotto, stato variante, cestino.
 * Il cestino NON è uno stato — è un asse a parte, con la stessa colonna su
 * prodotto e variante.
 */

export const TRASH_LABEL = 'Nel cestino';
/** `error`: è lo stato locale più forte, e non va confuso con «Non attivo» (`warning`). */
export const TRASH_TONE: BadgeTone = 'error';

/** `deletedAt` valorizzato = «Nel cestino». Vale per prodotto e variante. */
export function isInTrash(row: { readonly deletedAt?: string | null }): boolean {
  return row.deletedAt != null;
}

/** «Non attivo» per il prodotto: `archived`. La bozza NON è «non attivo». */
export function isProductInactive(row: { readonly status: ProductStatus }): boolean {
  return row.status === ProductStatus.Archived;
}

const VARIANT_STATE_LABELS: Readonly<Record<VariantLifecycleStatus, string>> = {
  [VariantLifecycleStatus.Active]: 'Attiva',
  [VariantLifecycleStatus.Inactive]: 'Non attiva',
};

const VARIANT_STATE_TONES: Readonly<Record<VariantLifecycleStatus, BadgeTone>> = {
  [VariantLifecycleStatus.Active]: 'success',
  [VariantLifecycleStatus.Inactive]: 'warning',
};

/** Etichetta dello stato locale della variante (§3.3): «Attiva» / «Non attiva». */
export function variantLifecycleLabel(status: VariantLifecycleStatus): string {
  return VARIANT_STATE_LABELS[status];
}

export function variantLifecycleTone(status: VariantLifecycleStatus): BadgeTone {
  return VARIANT_STATE_TONES[status];
}
