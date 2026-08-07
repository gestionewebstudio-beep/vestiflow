/**
 * Regimi fiscali FatturaPA (RegimeFiscale, specifiche tecniche SDI).
 * Specchio dichiarato di api/src/tenant/tax-regime.constant.ts: stessi codici,
 * qui con le etichette per select e riepiloghi. RF03 non esiste più nello
 * standard: non va reintrodotto.
 */
export interface TaxRegimeOption {
  readonly code: string;
  readonly label: string;
}

export const TAX_REGIME_OPTIONS: readonly TaxRegimeOption[] = [
  { code: 'RF01', label: 'Ordinario' },
  { code: 'RF02', label: 'Contribuenti minimi' },
  { code: 'RF04', label: 'Agricoltura e attività connesse e pesca' },
  { code: 'RF05', label: 'Vendita sali e tabacchi' },
  { code: 'RF06', label: 'Commercio dei fiammiferi' },
  { code: 'RF07', label: 'Editoria' },
  { code: 'RF08', label: 'Gestione di servizi di telefonia pubblica' },
  { code: 'RF09', label: 'Rivendita di documenti di trasporto pubblico e di sosta' },
  { code: 'RF10', label: 'Intrattenimenti e giochi (art. 74, c. 6, DPR 633/72)' },
  { code: 'RF11', label: 'Agenzie di viaggi e turismo' },
  { code: 'RF12', label: 'Agriturismo' },
  { code: 'RF13', label: 'Vendite a domicilio' },
  { code: 'RF14', label: 'Rivendita di beni usati e oggetti d’arte (margine)' },
  { code: 'RF15', label: 'Agenzie di vendite all’asta di oggetti d’arte' },
  { code: 'RF16', label: 'IVA per cassa P.A.' },
  { code: 'RF17', label: 'IVA per cassa (art. 32-bis, DL 83/2012)' },
  { code: 'RF18', label: 'Altro' },
  { code: 'RF19', label: 'Forfettario' },
] as const;

export const DEFAULT_TAX_REGIME_CODE = 'RF01';

/** «RF19 — Forfettario»; il solo codice se non è in elenco. */
export function taxRegimeDisplayLabel(code: string | null | undefined): string | null {
  const trimmed = code?.trim();
  if (!trimmed) {
    return null;
  }
  const option = TAX_REGIME_OPTIONS.find((entry) => entry.code === trimmed);
  return option ? `${option.code} — ${option.label}` : trimmed;
}
