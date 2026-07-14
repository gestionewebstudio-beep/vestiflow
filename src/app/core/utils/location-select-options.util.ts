import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/** Suffisso etichetta della sede predefinita nelle tendine sede. */
export const DEFAULT_LOCATION_LABEL_SUFFIX = ' (predefinita)';

/**
 * Opzioni sede per i select dei form operativi: la sede predefinita compare
 * PRIMA nella lista con l'etichetta "(predefinita)". È solo un suggerimento
 * visivo: la selezione resta all'utente (specifica cliente — mai fallback
 * automatico "prima location disponibile").
 */
export function toLocationSelectOptions(
  locations: readonly { readonly id: string; readonly name: string }[],
  defaultLocationId: string | null | undefined,
): readonly SelectMenuOption[] {
  const options = locations.map((location) => ({
    value: location.id,
    label:
      location.id === defaultLocationId
        ? `${location.name}${DEFAULT_LOCATION_LABEL_SUFFIX}`
        : location.name,
  }));
  if (!defaultLocationId) {
    return options;
  }
  const preferred = options.filter((option) => option.value === defaultLocationId);
  const rest = options.filter((option) => option.value !== defaultLocationId);
  return [...preferred, ...rest];
}
