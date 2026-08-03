import type { TenantFeatureSettings } from '@domain/tenant/models/tenant-feature-settings.model';

import type { ProductGeneralDraft } from './product-form.model';

/**
 * I listini aggiuntivi sono TRE posizioni fisse (§B), non una lista che cresce:
 * il tenant può rinominarle e attivarle, non aggiungerne. Uno slot è la
 * posizione così come va mostrata in anagrafica.
 */
export interface ProductListinoSlot {
  readonly position: 1 | 2 | 3;
  /** Campo del draft (e del DTO) che porta il valore di questa posizione. */
  readonly field: 'listino1Price' | 'listino2Price' | 'listino3Price';
  /** Nome dato dal tenant, o l'etichetta di default se non l'ha mai cambiato. */
  readonly label: string;
  /** `id` dell'input, per l'associazione con la `<label>`. */
  readonly inputId: string;
}

const DEFAULT_LABELS: Readonly<Record<1 | 2 | 3, string>> = {
  1: 'Listino 1',
  2: 'Listino 2',
  3: 'Listino 3',
};

/** Chiavi del draft per posizione: l'unica mappa posizione → campo del modello. */
export const LISTINO_FIELDS: Readonly<
  Record<
    1 | 2 | 3,
    keyof Pick<ProductGeneralDraft, 'listino1Price' | 'listino2Price' | 'listino3Price'>
  >
> = {
  1: 'listino1Price',
  2: 'listino2Price',
  3: 'listino3Price',
};

/**
 * Posizioni da mostrare in anagrafica: solo quelle ATTIVE per il tenant. Un
 * listino spento non compare — non è un campo disabilitato, è un campo che per
 * questo tenant non esiste. Impostazioni non ancora caricate = nessuno slot
 * (meglio niente che tre campi che spariscono un istante dopo).
 */
export function activeListinoSlots(
  settings: TenantFeatureSettings | null,
): readonly ProductListinoSlot[] {
  if (!settings) {
    return [];
  }
  const active: readonly (readonly [1 | 2 | 3, boolean, string | null])[] = [
    [1, settings.listino1Active, settings.listino1Name],
    [2, settings.listino2Active, settings.listino2Name],
    [3, settings.listino3Active, settings.listino3Name],
  ];
  return active
    .filter(([, isActive]) => isActive)
    .map(([position, , name]) => ({
      position,
      field: LISTINO_FIELDS[position],
      label: name?.trim() || DEFAULT_LABELS[position],
      inputId: `product-listino-${position}-price`,
    }));
}
