/**
 * Regimi fiscali FatturaPA (tabella `RegimeFiscale` del tracciato 1.2.x).
 *
 * Elenco chiuso definito dallo standard, non una scelta di prodotto: le
 * etichette da mostrare stanno nel frontend
 * (`src/app/domain/tenant/models/tax-regime.model.ts`), qui servono solo i
 * codici per rifiutare un valore inventato.
 */
export const TAX_REGIME_CODES = [
  'RF01',
  'RF02',
  'RF04',
  'RF05',
  'RF06',
  'RF07',
  'RF08',
  'RF09',
  'RF10',
  'RF11',
  'RF12',
  'RF13',
  'RF14',
  'RF15',
  'RF16',
  'RF17',
  'RF18',
  'RF19',
] as const;

export type TaxRegimeCode = (typeof TAX_REGIME_CODES)[number];

/**
 * Regime ordinario: è quello della grande maggioranza dei negozi, ed è il
 * valore che l'XML scriveva cablato prima che il campo esistesse. Chi non
 * dichiara nulla continua a comportarsi come prima.
 */
export const DEFAULT_TAX_REGIME: TaxRegimeCode = 'RF01';
