import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { UnitOfMeasureOption } from '@domain/products/models/unit-of-measure-option.model';

/**
 * Le unità attive del tenant in forma di voce per la cella di riga.
 *
 * Il valore **è** l'etichetta, e non è una scorciatoia: sulla riga l'unità si
 * salva come stringa, quindi `pz` non ha un identificativo da nascondere. È
 * anche ciò che rende il testo libero possibile — un valore che non sta in
 * elenco resta comunque un valore valido.
 *
 * Le disattivate non si propongono. Non serve ripescare quella già scritta
 * sulla riga, come invece serve per l'IVA: la cella ammette il testo libero e
 * mostra il valore così com'è, anche quando l'elenco non lo conosce più.
 */
export function unitOfMeasureSelectOptions(
  options: readonly UnitOfMeasureOption[],
): readonly SelectMenuOption[] {
  return options
    .filter((option) => option.isActive)
    .map((option) => ({ value: option.name, label: option.name }));
}
