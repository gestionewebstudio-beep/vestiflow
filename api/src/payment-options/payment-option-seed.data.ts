import type { PaymentOptionKind } from '@prisma/client';

/**
 * Voci pagamento preimpostate (logica Danea): due elenchi separati,
 * modalità e condizioni. Seed al primo accesso del tenant; le voci
 * restano modificabili/estendibili dalle Impostazioni.
 */
export interface PaymentOptionSeedEntry {
  readonly kind: PaymentOptionKind;
  readonly name: string;
  readonly sortOrder: number;
}

/**
 * Modalità di pagamento previste dalla normativa per la fatturazione
 * elettronica (codici ModalitaPagamento SDI MP01–MP23, prompt DDT §TESTATA).
 * Il codice fa parte del nome: le anagrafiche salvano il nome come snapshot
 * e la stampa/esport riporta la modalità normativa senza mapping ulteriori.
 */
export const SDI_PAYMENT_METHOD_NAMES: readonly string[] = [
  'Contanti (MP01)',
  'Assegno (MP02)',
  'Assegno circolare (MP03)',
  'Contanti presso Tesoreria (MP04)',
  'Bonifico (MP05)',
  'Vaglia cambiario (MP06)',
  'Bollettino bancario (MP07)',
  'Carta di pagamento (MP08)',
  'RID (MP09)',
  'RID utenze (MP10)',
  'RID veloce (MP11)',
  'RIBA (MP12)',
  'MAV (MP13)',
  'Quietanza erario (MP14)',
  'Giroconto su conti di contabilità speciale (MP15)',
  'Domiciliazione bancaria (MP16)',
  'Domiciliazione postale (MP17)',
  'Bollettino di c/c postale (MP18)',
  'SEPA Direct Debit (MP19)',
  'SEPA Direct Debit CORE (MP20)',
  'SEPA Direct Debit B2B (MP21)',
  'Trattenuta su somme già riscosse (MP22)',
  'PagoPA (MP23)',
] as const;

export const PAYMENT_OPTION_SEED: readonly PaymentOptionSeedEntry[] = [
  // Modalità di pagamento: elenco normativo fatturazione elettronica.
  ...SDI_PAYMENT_METHOD_NAMES.map((name, index) => ({
    kind: 'method' as PaymentOptionKind,
    name,
    sortOrder: index + 1,
  })),
  // Condizioni di pagamento
  { kind: 'terms', name: 'Vista fattura', sortOrder: 1 },
  { kind: 'terms', name: '30 gg d.f.', sortOrder: 2 },
  { kind: 'terms', name: '30 gg f.m.', sortOrder: 3 },
  { kind: 'terms', name: '60 gg d.f.', sortOrder: 4 },
  { kind: 'terms', name: '60 gg f.m.', sortOrder: 5 },
  { kind: 'terms', name: '90 gg d.f.', sortOrder: 6 },
  { kind: 'terms', name: 'Pagamento anticipato', sortOrder: 7 },
];
