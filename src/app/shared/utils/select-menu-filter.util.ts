import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/** Filtra opzioni select-menu per label e detail (case-insensitive, locale IT). */
export function filterSelectMenuOptions(
  options: readonly SelectMenuOption[],
  query: string,
): readonly SelectMenuOption[] {
  const normalized = query.trim().toLocaleLowerCase('it-IT');
  if (!normalized) {
    return options;
  }

  return options.filter((option) => {
    const haystack = [option.label, option.detail ?? ''].join(' ').toLocaleLowerCase('it-IT');
    return haystack.includes(normalized);
  });
}
