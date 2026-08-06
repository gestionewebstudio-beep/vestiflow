/**
 * Ridistribuzione delle larghezze colonna a somma costante.
 *
 * Le tabelle documento rendono le colonne come QUOTA del totale (vedi
 * `lineColumnWidth`): la tabella occupa sempre il 100% del contenitore. Perché
 * il ridimensionamento non la faccia traboccare — barra di scorrimento
 * orizzontale — lo spazio che una colonna guadagna deve essere ceduto dalle
 * altre, da entrambi i lati, e viceversa.
 */

export interface ColumnWidth {
  readonly id: string;
  /** Larghezza corrente, nella stessa scala per tutte le colonne. */
  readonly px: number;
  /** Larghezza sotto la quale la colonna non deve scendere. */
  readonly minPx: number;
}

/** Sotto questa differenza il trascinamento non ha ancora mosso nulla. */
const EPSILON = 0.5;

/**
 * Larghezze aggiornate con `columnId` portata a `targetPx` (o al massimo
 * concesso dai minimi delle altre). La somma resta identica a quella in
 * ingresso; le altre colonne assorbono la differenza in proporzione allo
 * spazio che possono cedere — o al loro peso, quando devono crescere.
 */
export function redistributeColumnWidths(
  columns: readonly ColumnWidth[],
  columnId: string,
  targetPx: number,
): ReadonlyMap<string, number> {
  const result = new Map(columns.map((column) => [column.id, column.px] as const));
  const target = columns.find((column) => column.id === columnId);
  const others = columns.filter((column) => column.id !== columnId);
  if (!target || others.length === 0) {
    return result;
  }

  const othersTotal = others.reduce((sum, column) => sum + column.px, 0);
  const othersMin = others.reduce((sum, column) => sum + column.minPx, 0);
  const clamped = Math.min(Math.max(targetPx, target.minPx), target.px + (othersTotal - othersMin));
  const delta = clamped - target.px;
  if (Math.abs(delta) < EPSILON) {
    return result;
  }
  result.set(columnId, clamped);

  // Crescendo, ogni altra colonna cede in proporzione a quanto PUÒ cedere
  // (larghezza meno minimo): così nessuna scende sotto il proprio minimo,
  // perché il clamp qui sopra tiene delta entro la capacità totale.
  // Restringendo, riprendono spazio in proporzione al loro peso.
  const capacity = others.map((column) => ({
    id: column.id,
    value: delta > 0 ? column.px - column.minPx : column.px,
  }));
  const capacityTotal = capacity.reduce((sum, item) => sum + item.value, 0);
  if (capacityTotal <= 0) {
    return result;
  }

  for (const item of capacity) {
    const column = others.find((other) => other.id === item.id)!;
    result.set(item.id, column.px - delta * (item.value / capacityTotal));
  }
  return result;
}
