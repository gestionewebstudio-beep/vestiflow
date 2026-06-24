import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/** Stagioni calendario per catalogazione interna. */
export const PRODUCT_SEASON_CALENDAR = ['Primavera', 'Estate', 'Autunno', 'Inverno'] as const;

/** Stagioni commerciali retail (PE/AI — comuni in moda, opzionali altrove). */
export const PRODUCT_SEASON_COMMERCIAL = ['PE', 'AI'] as const;

export const PRODUCT_SEASON_STANDARD_VALUES: readonly string[] = [
  ...PRODUCT_SEASON_CALENDAR,
  ...PRODUCT_SEASON_COMMERCIAL,
];

/** Valore select: apre inserimento libero (es. SS26, FW25). */
export const PRODUCT_SEASON_CUSTOM_OPTION = '__custom__';

const PRODUCT_SEASON_LABELS: Readonly<Record<string, string>> = {
  PE: 'PE (Primavera-Estate)',
  AI: 'AI (Autunno-Inverno)',
};

export function isStandardProductSeason(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && PRODUCT_SEASON_STANDARD_VALUES.includes(trimmed);
}

export function buildProductSeasonSelectOptions(currentValue: string): readonly SelectMenuOption[] {
  const trimmed = currentValue.trim();
  const standardOptions: SelectMenuOption[] = PRODUCT_SEASON_STANDARD_VALUES.map((value) => ({
    value,
    label: PRODUCT_SEASON_LABELS[value] ?? value,
  }));

  const withLegacy =
    trimmed && !isStandardProductSeason(trimmed)
      ? [{ value: trimmed, label: trimmed }, ...standardOptions]
      : standardOptions;

  return [
    ...withLegacy,
    {
      value: PRODUCT_SEASON_CUSTOM_OPTION,
      label: 'Altra stagione (es. SS26, FW25)…',
    },
  ];
}
