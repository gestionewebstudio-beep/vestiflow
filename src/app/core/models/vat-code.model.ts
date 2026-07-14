import type { EntityId } from './common.model';

/** Ambito di utilizzo di un Codice IVA (§3.4). */
export type VatUsageScope = 'purchase' | 'sales' | 'both';

/** Modalità di calcolo del Codice IVA (§3.5). */
export type VatCalculationMode =
  | 'standard'
  | 'zero_rate'
  | 'reverse_charge'
  | 'split_payment'
  | 'margin_scheme'
  | 'informational';

/** Modalità inserimento costi nell'Arrivo merce (§11.1). */
export type PurchaseCostEntryMode = 'vat_excluded' | 'vat_included';

/** Natura IVA di sistema (catalogo VestiFlow, §2). */
export interface VatNature {
  readonly id: EntityId;
  readonly key: string;
  readonly officialCode: string | null;
  readonly label: string;
  readonly description: string | null;
  readonly defaultUsageScope: VatUsageScope;
  readonly defaultCalculationMode: VatCalculationMode;
  readonly sortOrder: number;
}

/** Codice IVA aziendale (per tenant, §3). */
export interface VatCode {
  readonly id: EntityId;
  readonly code: string;
  readonly natureId: EntityId;
  readonly nature: VatNature;
  readonly ratePercent: number;
  readonly nonDeductiblePercent: number;
  readonly description: string;
  readonly notes: string | null;
  readonly usageScope: VatUsageScope;
  readonly calculationMode: VatCalculationMode;
  readonly vatAffectsSupplierTotal: boolean;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly isSystem: boolean;
  readonly sortOrder: number;
}

/** Snapshot IVA salvato sulle righe documento (§9). */
export interface VatSnapshot {
  readonly code: string;
  readonly natureKey: string;
  readonly natureLabel: string;
  readonly officialCode: string | null;
  readonly ratePercent: number;
  readonly description: string;
  readonly notes?: string | null;
  readonly nonDeductiblePercent: number;
  readonly calculationMode: VatCalculationMode;
  readonly vatAffectsSupplierTotal: boolean;
}

export const VAT_USAGE_SCOPE_LABELS: Record<VatUsageScope, string> = {
  purchase: 'Acquisti',
  sales: 'Vendite',
  both: 'Acquisti e vendite',
};

export const VAT_CALCULATION_MODE_LABELS: Record<VatCalculationMode, string> = {
  standard: 'Standard',
  zero_rate: 'Aliquota zero',
  reverse_charge: 'Reverse charge',
  split_payment: 'Split payment',
  margin_scheme: 'Regime del margine',
  informational: 'Informativa',
};

/** Formatta l'aliquota senza decimali superflui: 22 → "22%", 4.5 → "4,5%". */
export function formatVatRate(ratePercent: number): string {
  const formatted = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(ratePercent);
  return `${formatted}%`;
}

/** Etichetta compatta per tendine e tooltip: "22 · 22% · Imponibile 22%" (§6, §9.2). */
export function vatCodeOptionLabel(vatCode: {
  readonly code: string;
  readonly ratePercent: number;
  readonly description: string;
}): string {
  return `${vatCode.code} · ${formatVatRate(vatCode.ratePercent)} · ${vatCode.description}`;
}

/** Codici IVA utilizzabili nei documenti di acquisto (Arrivo merce). */
export function isPurchaseVatCode(vatCode: VatCode): boolean {
  return vatCode.usageScope === 'purchase' || vatCode.usageScope === 'both';
}

/** Codici IVA utilizzabili nei documenti di vendita (DDT, Fattura, Proforma…). */
export function isSalesVatCode(vatCode: VatCode): boolean {
  return vatCode.usageScope === 'sales' || vatCode.usageScope === 'both';
}
