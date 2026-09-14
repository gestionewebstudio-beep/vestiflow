import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * Che cosa un preset chiede IN PIÙ, una volta scelto: la giornata, i due estremi,
 * il mese, il trimestre, l'anno. È l'unica cosa che il selettore condiviso deve
 * sapere di una voce — non il suo significato, che resta di chi la risolve.
 */
export type PeriodFilterPicker = 'day' | 'range' | 'month' | 'quarter' | 'year';

/**
 * Una voce del selettore Periodo: un'opzione del `select-menu` più i selettori
 * che fa comparire. Le voci le dichiara la schermata, in un posto solo
 * (`REPORT_PERIOD_OPTIONS`, `MOVEMENT_PERIOD_OPTIONS`): il componente le rende
 * e basta.
 */
export interface PeriodFilterOption extends SelectMenuOption {
  readonly pickers?: readonly PeriodFilterPicker[];
}
