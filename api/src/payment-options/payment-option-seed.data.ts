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

export const PAYMENT_OPTION_SEED: readonly PaymentOptionSeedEntry[] = [
  // Modalità di pagamento
  { kind: 'method', name: 'Contanti', sortOrder: 1 },
  { kind: 'method', name: 'Bonifico bancario', sortOrder: 2 },
  { kind: 'method', name: 'Carta di pagamento', sortOrder: 3 },
  { kind: 'method', name: 'Assegno', sortOrder: 4 },
  { kind: 'method', name: 'RiBa', sortOrder: 5 },
  { kind: 'method', name: 'Contrassegno', sortOrder: 6 },
  { kind: 'method', name: 'PayPal', sortOrder: 7 },
  // Condizioni di pagamento
  { kind: 'terms', name: 'Vista fattura', sortOrder: 1 },
  { kind: 'terms', name: '30 gg d.f.', sortOrder: 2 },
  { kind: 'terms', name: '30 gg f.m.', sortOrder: 3 },
  { kind: 'terms', name: '60 gg d.f.', sortOrder: 4 },
  { kind: 'terms', name: '60 gg f.m.', sortOrder: 5 },
  { kind: 'terms', name: '90 gg d.f.', sortOrder: 6 },
  { kind: 'terms', name: 'Pagamento anticipato', sortOrder: 7 },
];
