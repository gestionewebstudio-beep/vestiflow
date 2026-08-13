/**
 * Regimi fiscali della fattura elettronica (tabella `RegimeFiscale` del
 * tracciato FatturaPA 1.2.x). Elenco chiuso definito dallo standard, non una
 * scelta di prodotto: i codici sono gli stessi che l'API accetta
 * (`api/src/common/company/tax-regime.constants.ts`).
 *
 * L'ordine non è quello del tracciato: davanti stanno i due casi che coprono
 * la quasi totalità dei negozi, dietro il resto in ordine di codice.
 */
export interface TaxRegimeOption {
  readonly code: string;
  readonly label: string;
}

export const TAX_REGIME_OPTIONS: readonly TaxRegimeOption[] = [
  { code: 'RF01', label: 'RF01 — Ordinario' },
  { code: 'RF19', label: 'RF19 — Forfettario (L. 190/2014)' },
  { code: 'RF02', label: 'RF02 — Contribuenti minimi' },
  { code: 'RF04', label: 'RF04 — Agricoltura e pesca' },
  { code: 'RF05', label: 'RF05 — Vendita sali e tabacchi' },
  { code: 'RF06', label: 'RF06 — Commercio fiammiferi' },
  { code: 'RF07', label: 'RF07 — Editoria' },
  { code: 'RF08', label: 'RF08 — Gestione servizi telefonia pubblica' },
  { code: 'RF09', label: 'RF09 — Rivendita documenti di trasporto' },
  { code: 'RF10', label: 'RF10 — Intrattenimenti e giochi' },
  { code: 'RF11', label: 'RF11 — Agenzie viaggi e turismo' },
  { code: 'RF12', label: 'RF12 — Agriturismo' },
  { code: 'RF13', label: 'RF13 — Vendite a domicilio' },
  { code: 'RF14', label: "RF14 — Rivendita beni usati, oggetti d'arte" },
  { code: 'RF15', label: "RF15 — Agenzie di vendita all'asta di oggetti d'arte" },
  { code: 'RF16', label: 'RF16 — IVA per cassa (P.A.)' },
  { code: 'RF17', label: 'RF17 — IVA per cassa (art. 32-bis)' },
  { code: 'RF18', label: 'RF18 — Altro' },
];

/** Il regime ordinario: è anche il valore che vale quando non si dichiara nulla. */
export const DEFAULT_TAX_REGIME_CODE = 'RF01';
