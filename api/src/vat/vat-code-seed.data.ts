import type { VatCalculationMode, VatUsageScope } from '@prisma/client';

/** Voce iniziale di Codice IVA creata per ogni tenant (§4). */
export interface VatCodeSeedEntry {
  readonly code: string;
  readonly natureKey: string;
  readonly ratePercent: number;
  readonly description: string;
  readonly usageScope: VatUsageScope;
  readonly calculationMode: VatCalculationMode;
  readonly vatAffectsSupplierTotal: boolean;
  readonly sortOrder: number;
}

export const VAT_CODE_SEED: readonly VatCodeSeedEntry[] = [
  // Imponibili (§4.1)
  { code: '22', natureKey: 'TAXABLE', ratePercent: 22, description: 'Imponibile 22%', usageScope: 'both', calculationMode: 'standard', vatAffectsSupplierTotal: true, sortOrder: 1 },
  { code: '10', natureKey: 'TAXABLE', ratePercent: 10, description: 'Imponibile 10%', usageScope: 'both', calculationMode: 'standard', vatAffectsSupplierTotal: true, sortOrder: 2 },
  { code: '5', natureKey: 'TAXABLE', ratePercent: 5, description: 'Imponibile 5%', usageScope: 'both', calculationMode: 'standard', vatAffectsSupplierTotal: true, sortOrder: 3 },
  { code: '4', natureKey: 'TAXABLE', ratePercent: 4, description: 'Imponibile 4%', usageScope: 'both', calculationMode: 'standard', vatAffectsSupplierTotal: true, sortOrder: 4 },
  // Voci allo 0% (§4.2)
  { code: 'X15', natureKey: 'N1', ratePercent: 0, description: 'Escluso art. 15 DPR 633/72', usageScope: 'both', calculationMode: 'zero_rate', vatAffectsSupplierTotal: false, sortOrder: 10 },
  { code: 'FC', natureKey: 'N2_2', ratePercent: 0, description: 'Fuori campo IVA', usageScope: 'both', calculationMode: 'zero_rate', vatAffectsSupplierTotal: false, sortOrder: 11 },
  { code: 'N8A', natureKey: 'N3_1', ratePercent: 0, description: 'Non imponibile – esportazioni', usageScope: 'both', calculationMode: 'zero_rate', vatAffectsSupplierTotal: false, sortOrder: 12 },
  { code: 'E10', natureKey: 'N4', ratePercent: 0, description: 'Esente art. 10 DPR 633/72', usageScope: 'both', calculationMode: 'zero_rate', vatAffectsSupplierTotal: false, sortOrder: 13 },
  // Acquisto reverse charge (§4.3)
  { code: '22R', natureKey: 'PURCHASE_REVERSE_CHARGE', ratePercent: 22, description: 'Acquisto reverse charge 22%', usageScope: 'purchase', calculationMode: 'reverse_charge', vatAffectsSupplierTotal: false, sortOrder: 20 },
  { code: '10R', natureKey: 'PURCHASE_REVERSE_CHARGE', ratePercent: 10, description: 'Acquisto reverse charge 10%', usageScope: 'purchase', calculationMode: 'reverse_charge', vatAffectsSupplierTotal: false, sortOrder: 21 },
  { code: '5R', natureKey: 'PURCHASE_REVERSE_CHARGE', ratePercent: 5, description: 'Acquisto reverse charge 5%', usageScope: 'purchase', calculationMode: 'reverse_charge', vatAffectsSupplierTotal: false, sortOrder: 22 },
  { code: '4R', natureKey: 'PURCHASE_REVERSE_CHARGE', ratePercent: 4, description: 'Acquisto reverse charge 4%', usageScope: 'purchase', calculationMode: 'reverse_charge', vatAffectsSupplierTotal: false, sortOrder: 23 },
] as const;

/** Catalogo Nature IVA di sistema (§2). */
export interface VatNatureSeedEntry {
  readonly key: string;
  readonly officialCode: string | null;
  readonly label: string;
  readonly description: string | null;
  readonly defaultUsageScope: VatUsageScope;
  readonly defaultCalculationMode: VatCalculationMode;
  readonly sortOrder: number;
}

export const VAT_NATURE_SEED: readonly VatNatureSeedEntry[] = [
  { key: 'TAXABLE', officialCode: null, label: 'Imponibile', description: 'Operazioni imponibili con aliquota IVA ordinaria o ridotta.', defaultUsageScope: 'both', defaultCalculationMode: 'standard', sortOrder: 1 },
  { key: 'PURCHASE_REVERSE_CHARGE', officialCode: null, label: 'Acquisto reverse charge', description: 'Acquisti con inversione contabile: IVA calcolata a parte, non dovuta al fornitore.', defaultUsageScope: 'purchase', defaultCalculationMode: 'reverse_charge', sortOrder: 2 },
  { key: 'SPLIT_PAYMENT', officialCode: null, label: 'Split payment', description: 'Scissione dei pagamenti verso PA.', defaultUsageScope: 'both', defaultCalculationMode: 'split_payment', sortOrder: 3 },
  { key: 'N1', officialCode: 'N1', label: 'N1: Escluso art. 15', description: null, defaultUsageScope: 'both', defaultCalculationMode: 'zero_rate', sortOrder: 10 },
  { key: 'N2_1', officialCode: 'N2.1', label: 'N2.1: Non soggetto per territorialità', description: null, defaultUsageScope: 'both', defaultCalculationMode: 'zero_rate', sortOrder: 11 },
  { key: 'N2_2', officialCode: 'N2.2', label: 'N2.2: Non soggetto – altri casi', description: null, defaultUsageScope: 'both', defaultCalculationMode: 'zero_rate', sortOrder: 12 },
  { key: 'N3_1', officialCode: 'N3.1', label: 'N3.1: Non imponibile – esportazioni', description: null, defaultUsageScope: 'both', defaultCalculationMode: 'zero_rate', sortOrder: 13 },
  { key: 'N3_2', officialCode: 'N3.2', label: 'N3.2: Non imponibile – cessioni intracomunitarie', description: null, defaultUsageScope: 'both', defaultCalculationMode: 'zero_rate', sortOrder: 14 },
  { key: 'N3_3', officialCode: 'N3.3', label: 'N3.3: Non imponibile – cessioni verso San Marino', description: null, defaultUsageScope: 'both', defaultCalculationMode: 'zero_rate', sortOrder: 15 },
  { key: 'N3_4', officialCode: 'N3.4', label: 'N3.4: Non imponibile – operazioni assimilate alle esportazioni', description: null, defaultUsageScope: 'both', defaultCalculationMode: 'zero_rate', sortOrder: 16 },
  { key: 'N3_5', officialCode: 'N3.5', label: "N3.5: Non imponibile – dichiarazioni d'intento", description: null, defaultUsageScope: 'both', defaultCalculationMode: 'zero_rate', sortOrder: 17 },
  { key: 'N3_6', officialCode: 'N3.6', label: 'N3.6: Non imponibile – altre operazioni', description: null, defaultUsageScope: 'both', defaultCalculationMode: 'zero_rate', sortOrder: 18 },
  { key: 'N4', officialCode: 'N4', label: 'N4: Esente', description: null, defaultUsageScope: 'both', defaultCalculationMode: 'zero_rate', sortOrder: 19 },
  { key: 'N5', officialCode: 'N5', label: 'N5: Regime del margine / IVA non esposta', description: null, defaultUsageScope: 'both', defaultCalculationMode: 'margin_scheme', sortOrder: 20 },
  { key: 'N6_1', officialCode: 'N6.1', label: 'N6.1: Inversione contabile – cessione di rottami', description: null, defaultUsageScope: 'sales', defaultCalculationMode: 'reverse_charge', sortOrder: 21 },
  { key: 'N6_2', officialCode: 'N6.2', label: 'N6.2: Inversione contabile – oro e argento', description: null, defaultUsageScope: 'sales', defaultCalculationMode: 'reverse_charge', sortOrder: 22 },
  { key: 'N6_3', officialCode: 'N6.3', label: 'N6.3: Inversione contabile – subappalto edilizia', description: null, defaultUsageScope: 'sales', defaultCalculationMode: 'reverse_charge', sortOrder: 23 },
  { key: 'N6_4', officialCode: 'N6.4', label: 'N6.4: Inversione contabile – cessione fabbricati', description: null, defaultUsageScope: 'sales', defaultCalculationMode: 'reverse_charge', sortOrder: 24 },
  { key: 'N6_5', officialCode: 'N6.5', label: 'N6.5: Inversione contabile – telefoni cellulari', description: null, defaultUsageScope: 'sales', defaultCalculationMode: 'reverse_charge', sortOrder: 25 },
  { key: 'N6_6', officialCode: 'N6.6', label: 'N6.6: Inversione contabile – prodotti elettronici', description: null, defaultUsageScope: 'sales', defaultCalculationMode: 'reverse_charge', sortOrder: 26 },
  { key: 'N6_7', officialCode: 'N6.7', label: 'N6.7: Inversione contabile – comparto edile', description: null, defaultUsageScope: 'sales', defaultCalculationMode: 'reverse_charge', sortOrder: 27 },
  { key: 'N6_8', officialCode: 'N6.8', label: 'N6.8: Inversione contabile – settore energetico', description: null, defaultUsageScope: 'sales', defaultCalculationMode: 'reverse_charge', sortOrder: 28 },
  { key: 'N6_9', officialCode: 'N6.9', label: 'N6.9: Inversione contabile – altri casi', description: null, defaultUsageScope: 'sales', defaultCalculationMode: 'reverse_charge', sortOrder: 29 },
  { key: 'N7', officialCode: 'N7', label: 'N7: IVA assolta in altro Stato UE', description: null, defaultUsageScope: 'both', defaultCalculationMode: 'zero_rate', sortOrder: 30 },
  { key: 'OTHER', officialCode: null, label: 'Altro', description: 'Voci non riconducibili alle Nature precedenti.', defaultUsageScope: 'both', defaultCalculationMode: 'informational', sortOrder: 99 },
] as const;
