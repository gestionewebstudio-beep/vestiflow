import type { NavTab } from '@shared/components/nav-tabs/nav-tabs.component';

/**
 * ⭐ **Le tre aree della Cassa**, dichiarate una volta sola.
 *
 * ⛔ Erano tre `<a>` sciolti nella testata di ogni registro, con la regola
 * `.ops__link` copiata in `.sess__link`: la stessa navigazione scritta due
 * volte, e vestita due volte.
 *
 * ⚠️ **Le due prove e2e le cercano per nome** (`e2e/cassa.spec.ts`, «le tre aree
 * si raggiungono l'una dall'altra»): rinominarle qui rompe quella prova, ed e`
 * giusto cosi`.
 */
export const CASH_TABS: readonly NavTab[] = [
  { label: 'Vendita', link: '/app/cassa' },
  { label: 'Operazioni', link: '/app/cassa/operazioni' },
  { label: 'Sessioni', link: '/app/cassa/sessioni' },
];
