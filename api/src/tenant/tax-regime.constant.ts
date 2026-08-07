/**
 * Regimi fiscali FatturaPA (RegimeFiscale, specifiche tecniche SDI).
 * RF03 non esiste più nello standard: non va reintrodotto.
 * Il mirror frontend con le etichette è in
 * src/app/domain/tenant/models/tax-regime.model.ts.
 */
export const TAX_REGIME_CODES = [
  'RF01', // Ordinario
  'RF02', // Contribuenti minimi
  'RF04', // Agricoltura e attività connesse e pesca
  'RF05', // Vendita sali e tabacchi
  'RF06', // Commercio dei fiammiferi
  'RF07', // Editoria
  'RF08', // Gestione di servizi di telefonia pubblica
  'RF09', // Rivendita di documenti di trasporto pubblico e di sosta
  'RF10', // Intrattenimenti, giochi (art. 74, c. 6, DPR 633/72)
  'RF11', // Agenzie di viaggi e turismo
  'RF12', // Agriturismo
  'RF13', // Vendite a domicilio
  'RF14', // Rivendita di beni usati, oggetti d'arte (regime del margine)
  'RF15', // Agenzie di vendite all'asta di oggetti d'arte
  'RF16', // IVA per cassa P.A.
  'RF17', // IVA per cassa (art. 32-bis, DL 83/2012)
  'RF18', // Altro
  'RF19', // Forfettario
] as const;

export type TaxRegimeCode = (typeof TAX_REGIME_CODES)[number];

export const DEFAULT_TAX_REGIME_CODE: TaxRegimeCode = 'RF01';
